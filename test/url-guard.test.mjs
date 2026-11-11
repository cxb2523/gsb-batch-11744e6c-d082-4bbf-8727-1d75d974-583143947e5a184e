import test from 'node:test';
import assert from 'node:assert/strict';

import { checkFetchableUrl, classifyHost, parseIpv4, parseIpv6 } from '../src/storyboard/url-guard.js';
import { assertFetchableUrl, normalizeUrl } from '../src/storyboard/url.js';

/* ---------------------------------------------------------------- 公网放行 */

test('classifyHost: 公网域名与公网 IP 都是 public 且不拦截', () => {
  for (const host of ['www.bilibili.com', 'example.com', '8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    const verdict = classifyHost(host);
    assert.equal(verdict.category, 'public', host);
    assert.equal(verdict.blocked, false, host);
  }
  // 边界：172.16/12 的两头之外是公网
  assert.equal(classifyHost('172.15.0.1').category, 'public');
  assert.equal(classifyHost('172.32.0.1').category, 'public');
});

test('checkFetchableUrl: 公网链接 ok，判定结果可 JSON 序列化', () => {
  const verdict = checkFetchableUrl('https://www.bilibili.com/video/BV1xx');
  assert.equal(verdict.ok, true);
  assert.equal(verdict.category, 'public');
  assert.equal(verdict.host, 'www.bilibili.com');
  assert.equal(typeof verdict.reason, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(verdict)), verdict, '判定结果必须是纯数据，能直接写日志');
});

/* ---------------------------------------------------------------- 回环 */

test('classifyHost: localhost 与 127.0.0.0/8、::1 都是 loopback', () => {
  for (const host of ['localhost', 'LOCALHOST', 'foo.localhost', '127.0.0.1', '127.5.6.7', '::1', '[::1]']) {
    const verdict = classifyHost(host);
    assert.equal(verdict.category, 'loopback', host);
    assert.equal(verdict.blocked, true, host);
  }
});

/* ---------------------------------------------------------------- 私有网段 */

test('classifyHost: 10/8、172.16/12、192.168/16 都是 private', () => {
  for (const host of ['10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
    const verdict = classifyHost(host);
    assert.equal(verdict.category, 'private', host);
    assert.equal(verdict.blocked, true, host);
  }
});

/* ---------------------------------------------------------------- 链路本地与唯一本地 */

test('classifyHost: 169.254/16 与 fe80::/10 是 link-local（云元数据段）', () => {
  for (const host of ['169.254.169.254', '169.254.0.1', 'fe80::1', '[fe80::a1b2:1]', 'fe80::1%eth0']) {
    const verdict = classifyHost(host);
    assert.equal(verdict.category, 'link-local', host);
    assert.equal(verdict.blocked, true, host);
  }
});

test('classifyHost: fc00::/7 是 unique-local', () => {
  for (const host of ['fc00::1', 'fd00::1', 'fdff:ffff::1']) {
    const verdict = classifyHost(host);
    assert.equal(verdict.category, 'unique-local', host);
    assert.equal(verdict.blocked, true, host);
  }
});

/* ---------------------------------------------------------------- IPv4 映射到 IPv6 */

test('classifyHost: ::ffff:a.b.c.d 按映射后的 IPv4 归类', () => {
  const mapped = classifyHost('::ffff:10.0.0.1');
  assert.equal(mapped.category, 'private', '映射后的 10.0.0.1 是私网，不能因为外壳是 IPv6 就放行');
  assert.equal(mapped.kind, 'ipv4-mapped-ipv6');
  assert.equal(mapped.mappedTo, '10.0.0.1');
  assert.equal(mapped.blocked, true);

  assert.equal(classifyHost('[::ffff:127.0.0.1]').category, 'loopback');
  assert.equal(classifyHost('::ffff:169.254.169.254').category, 'link-local');
  // 十六进制组写法的映射地址（::ffff:a00:1 === ::ffff:10.0.0.1）同样按映射后判
  assert.equal(classifyHost('::ffff:a00:1').category, 'private');
  // 映射到公网的不拦
  assert.equal(classifyHost('::ffff:8.8.8.8').category, 'public');
});

/* ---------------------------------------------------------------- 非点分 IPv4 写法 */

test('classifyHost: 十进制/八进制/十六进制写法先解析成真实地址再判', () => {
  // 这些都是 127.0.0.1 的变体，字符串正则会全部漏掉
  for (const host of ['2130706433', '0x7f000001', '0177.0.0.1', '0x7f.1', '127.1', '0x7f.0.0.1']) {
    const verdict = classifyHost(host);
    assert.equal(verdict.category, 'loopback', host);
    assert.equal(verdict.host, '127.0.0.1', `${host} 必须归一到真实地址`);
    assert.equal(verdict.blocked, true, host);
  }
  // 整数写法的私网与链路本地
  assert.equal(classifyHost('167772161').category, 'private');        // 10.0.0.1
  assert.equal(classifyHost('2852039166').category, 'link-local');    // 169.254.169.254
  assert.equal(classifyHost('0xC0A80101').category, 'private');       // 192.168.1.1
  // 整数写法的公网不拦
  assert.equal(classifyHost('134744072').category, 'public');         // 8.8.8.8
});

test('parseIpv4 / parseIpv6: 解析器本身的边界', () => {
  assert.equal(parseIpv4('2130706433'), 2130706433);
  assert.equal(parseIpv4('0177.0.0.1'), 2130706433);
  assert.equal(parseIpv4('0x7f.1'), 2130706433);
  assert.equal(parseIpv4('256.0.0.1'), null, '段超界不是 IPv4');
  assert.equal(parseIpv4('4294967296'), null, '整数超界不是 IPv4');
  assert.equal(parseIpv4('example.com'), null);

  assert.deepEqual(parseIpv6('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseIpv6('::ffff:10.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0xa00, 1]);
  assert.equal(parseIpv6('::gg'), null);
  assert.equal(parseIpv6('1::2::3'), null, '两个 :: 不合法');
});

/* ---------------------------------------------------------------- checkFetchableUrl 的拒绝路径 */

test('checkFetchableUrl: 内网/回环/映射/整数写法全部被拒，类别可区分', () => {
  const cases = [
    ['http://127.0.0.1/a', 'loopback'],
    ['http://localhost/a', 'loopback'],
    ['http://[::1]/a', 'loopback'],
    ['http://10.0.0.5/a', 'private'],
    ['http://172.16.0.1/a', 'private'],
    ['http://192.168.1.1/a', 'private'],
    ['http://169.254.169.254/latest/meta-data', 'link-local'],
    ['http://[fe80::1]/a', 'link-local'],
    ['http://[fd00::1]/a', 'unique-local'],
    ['http://[::ffff:10.0.0.1]/a', 'private'],
    ['http://2130706433/a', 'loopback'],
    ['http://0177.0.0.1/a', 'loopback'],
    ['http://0x7f.1/a', 'loopback'],
  ];
  const categories = new Set();
  for (const [url, expected] of cases) {
    const verdict = checkFetchableUrl(url);
    assert.equal(verdict.ok, false, url);
    assert.equal(verdict.category, expected, url);
    assert.equal(verdict.blocked, true, url);
    assert.ok(verdict.reason.length > 0, `${url} 必须给出命中原因`);
    categories.add(verdict.category);
  }
  assert.ok(categories.size >= 4, '不同内网类别必须可区分，不能笼统归一类');
});

test('checkFetchableUrl: 非 http(s) 与无法解析的 URL 按现有语义拒绝', () => {
  for (const raw of ['D:/videos/a.mp4', 'C:\\videos\\a.mp4', 'file:///c:/a.mp4', 'ftp://example.com/a', '']) {
    const verdict = checkFetchableUrl(raw);
    assert.equal(verdict.ok, false, raw);
    assert.equal(verdict.category, 'not-http', raw);
  }
  assert.equal(checkFetchableUrl('http://[not-an-address').category, 'invalid-url');
});

/* ---------------------------------------------------------------- url.js 的兼容行为 */

test('assertFetchableUrl: 内网与回环抛错，消息仍带 private/loopback 与主机名', () => {
  for (const bad of [
    'http://127.0.0.1/a', 'http://localhost/a', 'http://10.0.0.5/a',
    'http://192.168.1.1/a', 'http://172.16.0.1/a', 'http://169.254.169.254/latest/meta-data',
    'http://2130706433/a', 'http://0x7f.1/a', 'http://[::ffff:10.0.0.1]/a',
  ]) {
    assert.throws(() => assertFetchableUrl(bad), /private\/loopback/, bad);
  }
  assert.throws(() => assertFetchableUrl('http://10.0.0.5/a'), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /10\.0\.0\.5/, '消息里要带主机名，便于排查');
    return true;
  });
  assert.equal(assertFetchableUrl('https://www.bilibili.com/video/BV1xx'), 'https://www.bilibili.com/video/BV1xx');
});

test('assertFetchableUrl: 本地裸路径仍按 only http(s) 抛错', () => {
  for (const raw of ['D:/a.mp4', 'C:\\videos\\a.mp4', 'file:///c:/a.mp4', '/tmp/a.mp4']) {
    assert.throws(() => assertFetchableUrl(raw), /only http\(s\) links/, raw);
  }
});

test('normalizeUrl: 仍保留分P参数 p，丢弃 spm_id_from 等跟踪参数', () => {
  const a = normalizeUrl('https://www.bilibili.com/video/BV1xx?spm_id_from=333.999&vd_source=abc&p=2');
  assert.ok(!a.includes('spm_id_from'));
  assert.ok(!a.includes('vd_source'));
  assert.ok(a.includes('p=2'), '分P 必须保留，否则不同 P 会撞同一个缓存键');
});
