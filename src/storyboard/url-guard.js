/**
 * url-guard.js — "这个链接能不能安全外取"的判定。**零依赖叶子**，纯函数、不触网。
 *
 * 从 url.js 的 PRIVATE_HOST 正则表升级而来：正则只能匹配"长得像点分十进制"的字符串，
 * 而 2130706433、0177.0.0.1、0x7f.1、::ffff:10.0.0.1 这些写法绕过正则后照样指向回环/内网
 * —— yt-dlp 会把链接交给 ffmpeg，一个 169.254.169.254 就能把云元数据读出来。
 * 所以这里的原则是**先解析成真实地址、再分类**，不在字符串层面做判断。
 *
 * 判定结果是纯数据（可 JSON 序列化），含类别、归一化后的主机、命中原因，
 * 调用方可以直接写进日志或清单做审计。
 */

/**
 * 主机类别。
 * - 'public'        公网（唯一放行的类别）
 * - 'loopback'      localhost / 127.0.0.0/8 / ::1
 * - 'private'       10.0.0.0/8、172.16.0.0/12、192.168.0.0/16
 * - 'link-local'    169.254.0.0/16（云元数据所在段）、fe80::/10
 * - 'unique-local'  fc00::/7（IPv6 私网）
 * - 'unspecified'   0.0.0.0/8、::（"本机"占位，路由行为因栈而异，不放行）
 */

/** 把主机名归一成小写、去 IPv6 方括号、去末尾的根域点。 */
function cleanHost(hostname) {
  let host = String(hostname ?? '').trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

/**
 * 解析 IPv4，兼容 inet_aton 的全部写法：点分十进制、八进制（0177）、十六进制（0x7f）、
 * 以及少段合并写法（2130706433、0x7f000001、127.1、10.65537）。
 * 返回 0..2^32-1 的整数；不是合法 IPv4 写法时返回 null。
 */
export function parseIpv4(host) {
  const parts = String(host).split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const nums = [];
  for (const part of parts) {
    if (part === '') return null;
    let n;
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
    else if (/^[0-9]+$/.test(part)) n = parseInt(part, 10);
    else return null;
    nums.push(n);
  }
  // inet_aton 语义：最后一段补齐剩余字节（1 段=32 位，2 段=8+24，3 段=8+8+16，4 段=8×4）
  const head = nums.slice(0, -1);
  const last = nums[nums.length - 1];
  if (head.some((n) => n > 255)) return null;
  if (last >= 2 ** (8 * (5 - nums.length))) return null;
  let value = last;
  for (let i = 0; i < head.length; i++) value += head[i] * 2 ** (8 * (3 - i));
  return value;
}

/** 把 32 位 IPv4 整数写成点分十进制。 */
function formatIpv4(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

/**
 * 解析 IPv6（含 :: 压缩、内嵌点分 IPv4 如 ::ffff:10.0.0.1、zone id 如 fe80::1%eth0）。
 * 返回 8 个 16 位组的数组；不合法返回 null。
 */
export function parseIpv6(host) {
  let s = String(host);
  const zoneAt = s.indexOf('%');
  if (zoneAt !== -1) s = s.slice(0, zoneAt); // zone id（含 URL 解码后的 %25）不影响地址分类
  if (s === '') return null;

  // 内嵌点分 IPv4 尾（::ffff:10.0.0.1）：换成两个十六进制组再按常规解析
  if (s.includes('.')) {
    const at = s.lastIndexOf(':');
    if (at === -1) return null;
    const v4 = parseIpv4(s.slice(at + 1));
    if (v4 === null) return null;
    s = `${s.slice(0, at)}:${Math.floor(v4 / 2 ** 16).toString(16)}:${(v4 % 2 ** 16).toString(16)}`;
  }

  const parseGroups = (str) => {
    if (str === '') return [];
    const groups = str.split(':').map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : null));
    return groups.includes(null) ? null : groups;
  };

  const halves = s.split('::');
  if (halves.length > 2) return null;
  if (halves.length === 2) {
    const head = parseGroups(halves[0]);
    const tail = parseGroups(halves[1]);
    if (head === null || tail === null) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    return [...head, ...Array(missing).fill(0), ...tail];
  }
  const groups = parseGroups(halves[0]);
  if (groups === null || groups.length !== 8) return null;
  return groups;
}

/** IPv4 整数 → 类别与原因。顺序即优先级。 */
function classifyIpv4(value) {
  const b0 = Math.floor(value / 2 ** 24);
  const b1 = Math.floor(value / 2 ** 16) % 256;
  if (b0 === 0) return { category: 'unspecified', reason: '0.0.0.0/8 is the "this host" block' };
  if (b0 === 127) return { category: 'loopback', reason: '127.0.0.0/8 is IPv4 loopback' };
  if (b0 === 10) return { category: 'private', reason: '10.0.0.0/8 is RFC 1918 private space' };
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return { category: 'private', reason: '172.16.0.0/12 is RFC 1918 private space' };
  if (b0 === 192 && b1 === 168) return { category: 'private', reason: '192.168.0.0/16 is RFC 1918 private space' };
  if (b0 === 169 && b1 === 254) return { category: 'link-local', reason: '169.254.0.0/16 is IPv4 link-local (cloud metadata lives here)' };
  return { category: 'public', reason: 'not in any loopback/private/link-local range' };
}

/**
 * 对主机名分类。hostname 可以是域名、点分/整数/八进制/十六进制 IPv4、带不带方括号的 IPv6。
 * 返回纯数据：{ category, host, kind, blocked, reason, mappedTo? }，可直接 JSON.stringify。
 */
export function classifyHost(hostname) {
  const host = cleanHost(hostname);

  const v4 = parseIpv4(host);
  if (v4 !== null) {
    const normalized = formatIpv4(v4);
    const { category, reason } = classifyIpv4(v4);
    return {
      category,
      host: normalized,
      kind: 'ipv4',
      blocked: category !== 'public',
      reason: host === normalized ? reason : `${reason} (written as "${host}")`,
    };
  }

  if (host.includes(':')) {
    const groups = parseIpv6(host);
    if (groups !== null) {
      const normalized = groups.map((g) => g.toString(16)).join(':');
      // IPv4 映射到 IPv6（::ffff:a.b.c.d）：必须按映射后的 IPv4 判
      const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
      if (isMapped) {
        const v4value = groups[6] * 2 ** 16 + groups[7];
        const mappedTo = formatIpv4(v4value);
        const { category, reason } = classifyIpv4(v4value);
        return {
          category,
          host: normalized,
          kind: 'ipv4-mapped-ipv6',
          blocked: category !== 'public',
          reason: `IPv4-mapped IPv6 address; mapped ${mappedTo}: ${reason}`,
          mappedTo,
        };
      }
      let category, reason;
      if (groups.every((g) => g === 0)) {
        category = 'unspecified'; reason = ':: is the IPv6 unspecified address';
      } else if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
        category = 'loopback'; reason = '::1 is IPv6 loopback';
      } else if (groups[0] >= 0xfe80 && groups[0] <= 0xfebf) {
        category = 'link-local'; reason = 'fe80::/10 is IPv6 link-local';
      } else if ((groups[0] & 0xfe00) === 0xfc00) {
        category = 'unique-local'; reason = 'fc00::/7 is IPv6 unique-local (private)';
      } else {
        category = 'public'; reason = 'not in any loopback/private/link-local range';
      }
      return { category, host: normalized, kind: 'ipv6', blocked: category !== 'public', reason };
    }
  }

  // 域名：不做 DNS 解析（纯函数、不触网），只认字面 localhost；其余按公网对待，
  // 解析到内网的域名是 DNS 层的事，不在这个字符串判定的职责里。
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { category: 'loopback', host, kind: 'name', blocked: true, reason: 'localhost resolves to loopback' };
  }
  return { category: 'public', host, kind: 'name', blocked: false, reason: 'not a literal loopback/private address' };
}

/**
 * 判定一条链接能否安全外取。非 http(s) 与无法解析的 URL 一律拒绝（沿用 url.js 的语义）。
 * 返回纯数据：{ ok, category, host, kind, blocked, reason, url }。
 */
export function checkFetchableUrl(raw) {
  const url = String(raw ?? '').trim();
  const notFetchable = (category, reason) => ({
    ok: false, category, host: null, kind: null, blocked: true, reason, url,
  });

  if (!/^https?:\/\//i.test(url)) {
    return notFetchable('not-http', 'only http(s) links are fetched; for a local file pass the path directly');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return notFetchable('invalid-url', 'not a parsable URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return notFetchable('not-http', 'only http(s) links are fetched; for a local file pass the path directly');
  }
  // 注意：new URL 已经把 2130706433、0x7f.1 这类写法归一成点分十进制，
  // classifyHost 自己也能解析这些写法 —— 双保险，不依赖某一层的行为。
  const verdict = classifyHost(parsed.hostname);
  return { ok: !verdict.blocked, ...verdict, url };
}
