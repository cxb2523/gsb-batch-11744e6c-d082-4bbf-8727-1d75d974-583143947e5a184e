/**
 * url.js — 链接的判别、白名单与归一化。**零依赖叶子**，谁都能用。
 *
 * 从 fetch.js 拆出来的：`direct-url.js` 和 `fetch.js` 都要用，放在任何一边都会成环。
 * 三个函数看起来琐碎，但每一条规则都有事故背景（见各自的注释），所以它们值得单独一个文件
 * —— 改这里的规则等于改"什么算同一条视频"，不该埋在取流代码中间。
 */

import { checkFetchableUrl } from './url-guard.js';

/** 是不是 http(s) 链接。其它一切（含 file://、裸路径）都按本地文件处理。 */
export function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 允许的链接：只放 http(s)，且**拒绝内网地址**。
 * 理由不是洁癖 —— yt-dlp 会把链接交给 ffmpeg，一个 169.254.169.254 就能把云元数据读出来。
 *
 * 判定委托给 url-guard.js：先把主机解析成真实地址（含 2130706433、0x7f.1、::ffff:10.0.0.1
 * 这类绕过字符串正则的写法）再分类。这里只负责把判定结果翻译成兼容的 Error。
 */
export function assertFetchableUrl(raw) {
  const verdict = checkFetchableUrl(raw);
  if (!verdict.ok) {
    if (verdict.category === 'not-http' || verdict.category === 'invalid-url') {
      throw new Error('only http(s) links are fetched; for a local file pass the path directly');
    }
    throw new Error(`refusing to fetch a private/loopback host: ${verdict.host} (${verdict.category}: ${verdict.reason})`);
  }
  return verdict.url;
}

/**
 * 归一化链接，用来做缓存键。
 * 去掉站外跟踪参数（B 站会带一长串 spm_id_from），但**保留 `p`**（分P），否则不同 P 会撞同一个键。
 */
export function normalizeUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    url.hash = '';
    const drop = [];
    for (const key of url.searchParams.keys()) {
      if (/^(spm_id_from|vd_source|share_source|share_medium|share_plat|share_tag|timestamp|unique_k|from_source|from_spmid|bbid|ts)$/i.test(key)) {
        drop.push(key);
      }
    }
    for (const key of drop) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return String(raw).trim();
  }
}
