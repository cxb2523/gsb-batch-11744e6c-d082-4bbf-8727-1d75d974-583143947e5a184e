import { isIP } from 'node:net';

import * as ipaddr from 'ipaddr.js';

import type { BrowserProxyMode } from './security.js';

// ────────────────────────────────────────────────────────────────────────────
// Navigation policy diagnostics
//
// Pure, side-effect-free re-implementation of the decision logic used by
// `assertBrowserNavigationAllowed` / `resolvePinnedHostnameWithPolicy` in
// `security.ts`. It performs NO real DNS lookup, opens no browser, touches no
// filesystem and mutates no global state. All hostname resolution is driven by
// the caller-supplied `resolvedAddresses` snapshot.
//
// IMPORTANT: the hostname/IP classification helpers below are deliberately
// kept in lock-step with the private helpers in `security.ts`. If the security
// rules change there, mirror them here and extend navigation-diagnostics.test.ts.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Subset of {@link SsrfPolicy} fields consulted by navigation validation.
 * A full `SsrfPolicy` object is structurally assignable to this type.
 */
export interface NavigationDiagnosticsPolicy {
  dangerouslyAllowPrivateNetwork?: boolean;
  allowedHostnames?: string[];
  hostnameAllowlist?: string[];
  blockedHostnames?: string[];
  requireAllowlistedHostnames?: boolean;
  allowRfc2544BenchmarkRange?: boolean;
  allowIpv6UniqueLocalRange?: boolean;
}

/**
 * Pure-data snapshot describing one navigation decision to diagnose.
 */
export interface NavigationDiagnosticsInput {
  /** The URL that would be passed to `assertBrowserNavigationAllowed`. */
  url: string;
  /** SSRF policy fields; an empty/absent policy means strict secure-by-default. */
  policy?: NavigationDiagnosticsPolicy;
  /** How the target browser reaches the network. Defaults to `'direct'`. */
  browserProxyMode?: BrowserProxyMode;
  /** Whether environment proxy variables are currently detected (fail-close input). */
  hasEnvironmentProxy?: boolean;
  /**
   * Optional hostname → resolved-addresses snapshot used in place of real DNS.
   * Keys are normalized (lower-cased, trailing-dot/bracket stripped) before
   * lookup. A hostname that is absent from the map (or maps to an empty list)
   * is reported as unresolvable rather than silently allowed.
   */
  resolvedAddresses?: Record<string, string[]>;
}

/** Final machine-readable verdict. */
export type NavigationDiagnosticsVerdict = 'allow' | 'block' | 'needs-resolution';

/** Stable, machine-readable identifier of why a check failed. */
export type NavigationBlockReason =
  | 'empty-url'
  | 'invalid-url'
  | 'url-userinfo'
  | 'unsupported-protocol'
  | 'environment-proxy-fail-close'
  | 'browser-proxy-fail-close'
  | 'require-allowlisted-hostnames'
  | 'invalid-hostname'
  | 'blocked-hostname'
  | 'hostname-not-in-allowlist'
  | 'hostname-private-network'
  | 'unable-to-resolve'
  | 'resolved-address-private-network'
  | 'resolved-address-unspecified'
  | 'resolved-address-loopback'
  | 'resolved-address-cloud-metadata'
  | 'resolved-address-special-ipv6';

/** Stable identifiers for the ordered validation steps. */
export type NavigationCheckName =
  | 'empty-url'
  | 'invalid-url'
  | 'userinfo'
  | 'protocol'
  | 'proxy-fail-close'
  | 'require-allowlisted-hostnames'
  | 'blocked-hostnames'
  | 'hostname-allowlist'
  | 'hostname-private-network'
  | 'dns-resolution'
  | 'resolved-addresses';

/** One ordered validation step and its outcome. */
export interface NavigationDiagnosticsCheck {
  /** Stable identifier of the check. */
  name: NavigationCheckName;
  /** Whether the check passed (or was skipped). */
  passed: boolean;
  /** True when the check was not evaluated because an earlier check already failed or it does not apply. */
  skipped: boolean;
  /** Machine-readable failure reason; absent when the check passed or was skipped. */
  failureReason?: NavigationBlockReason;
  /** Human-readable explanation of the failure; never contains URL credentials. */
  failureMessage?: string;
}

/** Structured, JSON-serializable result of a navigation policy diagnosis. */
export interface NavigationDiagnosticsResult {
  /** Final verdict: allow, block, or resolution data is required. */
  verdict: NavigationDiagnosticsVerdict;
  /** The first blocking reason hit, in check order; absent unless `verdict === 'block'`. */
  blockReason?: NavigationBlockReason;
  /** Readable explanation of the block; never contains URL credentials. */
  blockMessage?: string;
  /** Whether the URL's host component is an IP literal (v4 or v6). */
  isIpLiteral: boolean;
  /** Whether private-network validation is skipped for this navigation. */
  skipPrivateNetworkChecks: boolean;
  /** Ordered check outcomes, matching the real implementation's evaluation order. */
  checks: NavigationDiagnosticsCheck[];
}

// ── Hostname normalization & blocking (mirror of security.ts) ──

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

function normalizeHostname(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

function isBlockedHostnameNormalized(normalized: string): boolean {
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return normalized.endsWith('.localhost') || normalized.endsWith('.local') || normalized.endsWith('.internal');
}

function normalizeHostnameSet(values?: string[]): Set<string> {
  if (!values || values.length === 0) return new Set();
  return new Set(values.map((v) => normalizeHostname(v)).filter(Boolean));
}

function normalizeHostnameAllowlist(values?: string[]): string[] {
  if (!values || values.length === 0) return [];
  return Array.from(
    new Set(values.map((v) => normalizeHostname(v)).filter((v) => v !== '*' && v !== '*.' && v.length > 0)),
  );
}

function isHostnameAllowedByPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    if (!suffix || hostname === suffix) return false;
    return hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
}

function matchesHostnameAllowlist(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // empty allowlist = no restriction
  return allowlist.some((pattern) => isHostnameAllowedByPattern(hostname, pattern));
}

function isIpLiteralHostname(hostname: string): boolean {
  return isIP(normalizeHostname(hostname)) !== 0;
}

function isExplicitlyAllowedBrowserHostname(hostname: string, policy?: NavigationDiagnosticsPolicy): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalizeHostnameSet(policy?.allowedHostnames).has(normalized)) return true;
  const allowlist = normalizeHostnameAllowlist(policy?.hostnameAllowlist);
  return allowlist.length > 0 ? matchesHostnameAllowlist(normalized, allowlist) : false;
}

function isPrivateNetworkAllowedByPolicy(policy?: NavigationDiagnosticsPolicy): boolean {
  // The deprecated `allowPrivateNetwork` alias is intentionally not part of the
  // diagnostics input surface; only the documented field is accepted here.
  return policy?.dangerouslyAllowPrivateNetwork === true;
}

// ── IP address classification (mirror of security.ts, via ipaddr.js) ──

const BLOCKED_IPV4_RANGES = new Set([
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'carrierGradeNat',
  'private',
  'reserved',
]);

const BLOCKED_IPV6_RANGES = new Set([
  'unspecified',
  'loopback',
  'linkLocal',
  'uniqueLocal',
  'multicast',
  'reserved',
  'benchmarking',
  'discard',
  'orchid2',
]);

const RFC2544_BENCHMARK_PREFIX: [ipaddr.IPv4, number] = [ipaddr.IPv4.parse('198.18.0.0'), 15];

const EMBEDDED_IPV4_SENTINEL_RULES: {
  matches: (parts: number[]) => boolean;
  toHextets: (parts: number[]) => [number, number];
}[] = [
  // IPv4-compatible (::a.b.c.d)
  {
    matches: (parts) =>
      parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0,
    toHextets: (parts) => [parts[6], parts[7]],
  },
  // 6to4 (2002::/16)
  {
    matches: (parts) => parts[0] === 0x2002,
    toHextets: (parts) => [parts[1], parts[2]],
  },
  // Teredo (2001:0000::/32) — IPv4 XOR'd
  {
    matches: (parts) => parts[0] === 0x2001 && parts[1] === 0x0000,
    toHextets: (parts) => [parts[6] ^ 0xffff, parts[7] ^ 0xffff],
  },
  // ISATAP — sentinel in parts[4-5]: 0x0000:0x5efe or 0x0200:0x5efe
  {
    matches: (parts) => (parts[4] & 0xfcff) === 0 && parts[5] === 0x5efe,
    toHextets: (parts) => [parts[6], parts[7]],
  },
];

function stripIpv6Brackets(value: string): string {
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1);
  return value;
}

function isNumericIpv4LiteralPart(value: string): boolean {
  return /^[0-9]+$/.test(value) || /^0x[0-9a-f]+$/i.test(value);
}

function parseIpv6WithEmbeddedIpv4(raw: string): ipaddr.IPv6 | undefined {
  if (!raw.includes(':') || !raw.includes('.')) return;
  const match = /^(.*:)([^:%]+(?:\.[^:%]+){3})(%[0-9A-Za-z]+)?$/i.exec(raw);
  if (!match) return;
  const [, prefix, embeddedIpv4, zoneSuffix = ''] = match;
  if (!ipaddr.IPv4.isValidFourPartDecimal(embeddedIpv4)) return;
  const octets = embeddedIpv4.split('.').map((part) => Number.parseInt(part, 10));
  const normalizedIpv6 = `${prefix}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}${zoneSuffix}`;
  if (!ipaddr.IPv6.isValid(normalizedIpv6)) return;
  return ipaddr.IPv6.parse(normalizedIpv6);
}

function normalizeIpParseInput(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') return;
  return stripIpv6Brackets(trimmed);
}

function parseCanonicalIpAddress(raw: string): ipaddr.IPv4 | ipaddr.IPv6 | undefined {
  const normalized = normalizeIpParseInput(raw);
  if (normalized === undefined) return;
  if (ipaddr.IPv4.isValid(normalized)) {
    if (!ipaddr.IPv4.isValidFourPartDecimal(normalized)) return;
    return ipaddr.IPv4.parse(normalized);
  }
  if (ipaddr.IPv6.isValid(normalized)) return ipaddr.IPv6.parse(normalized);
  return parseIpv6WithEmbeddedIpv4(normalized);
}

function parseLooseIpAddress(raw: string): ipaddr.IPv4 | ipaddr.IPv6 | undefined {
  const normalized = normalizeIpParseInput(raw);
  if (normalized === undefined) return;
  if (ipaddr.isValid(normalized)) return ipaddr.parse(normalized);
  return parseIpv6WithEmbeddedIpv4(normalized);
}

function isCanonicalDottedDecimalIPv4(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  const normalized = stripIpv6Brackets(trimmed);
  if (!normalized) return false;
  return ipaddr.IPv4.isValidFourPartDecimal(normalized);
}

function isLegacyIpv4Literal(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  const normalized = stripIpv6Brackets(trimmed);
  if (!normalized || normalized.includes(':')) return false;
  if (isCanonicalDottedDecimalIPv4(normalized)) return false;
  const parts = normalized.split('.');
  if (parts.length === 0 || parts.length > 4) return false;
  if (parts.some((part) => part.length === 0)) return false;
  if (!parts.every((part) => isNumericIpv4LiteralPart(part))) return false;
  return true;
}

function looksLikeUnsupportedIpv4Literal(address: string): boolean {
  const parts = address.split('.');
  if (parts.length === 0 || parts.length > 4) return false;
  if (parts.some((part) => part.length === 0)) return true;
  return parts.every((part) => /^[0-9]+$/.test(part) || /^0x/i.test(part));
}

function isBlockedSpecialUseIpv4Address(address: ipaddr.IPv4, policy?: NavigationDiagnosticsPolicy): boolean {
  const inRfc2544 = address.match(RFC2544_BENCHMARK_PREFIX);
  if (inRfc2544 && policy?.allowRfc2544BenchmarkRange === true) return false;
  return BLOCKED_IPV4_RANGES.has(address.range()) || inRfc2544;
}

function isRfc8215Nat64LocalUseAddress(address: ipaddr.IPv6): boolean {
  return address.parts[0] === 0x64 && address.parts[1] === 0xff9b && address.parts[2] === 1;
}

const CLOUD_METADATA_IPV6 = ['fd00:ec2::254'];

function isBlockedSpecialUseIpv6Address(address: ipaddr.IPv6, policy?: NavigationDiagnosticsPolicy): boolean {
  const range = address.range();
  if (isRfc8215Nat64LocalUseAddress(address)) return true;
  if (
    CLOUD_METADATA_IPV6.some(
      (metadata) => address.toNormalizedString() === ipaddr.IPv6.parse(metadata).toNormalizedString(),
    )
  )
    return true;
  if (range === 'uniqueLocal' && policy?.allowIpv6UniqueLocalRange === true) return false;
  if (BLOCKED_IPV6_RANGES.has(range)) return true;
  return (address.parts[0] & 0xffc0) === 0xfec0;
}

function decodeIpv4FromHextets(high: number, low: number): ipaddr.IPv4 {
  const octets = [(high >>> 8) & 0xff, high & 0xff, (low >>> 8) & 0xff, low & 0xff];
  return ipaddr.IPv4.parse(octets.join('.'));
}

function extractEmbeddedIpv4FromIpv6(address: ipaddr.IPv6): ipaddr.IPv4 | undefined {
  if (isRfc8215Nat64LocalUseAddress(address)) return;
  if (address.isIPv4MappedAddress()) return address.toIPv4Address();
  if (address.range() === 'rfc6145') return decodeIpv4FromHextets(address.parts[6], address.parts[7]);
  if (address.range() === 'rfc6052') return decodeIpv4FromHextets(address.parts[6], address.parts[7]);
  for (const rule of EMBEDDED_IPV4_SENTINEL_RULES) {
    if (!rule.matches(address.parts)) continue;
    const [high, low] = rule.toHextets(address.parts);
    return decodeIpv4FromHextets(high, low);
  }
}

function isBlockedTrustedResolvedIpv6Address(address: string): boolean {
  const parsed = parseCanonicalIpAddress(address);
  if (parsed?.kind() !== 'ipv6') return false;
  const range = parsed.range();
  if (range !== 'unicast' && range !== 'rfc6052') return false;
  return isBlockedSpecialUseIpv6Address(parsed as ipaddr.IPv6);
}

function isPrivateIpAddress(address: string, policy?: NavigationDiagnosticsPolicy): boolean {
  let normalized = address.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) normalized = normalized.slice(1, -1);
  // "[]" strips to empty string — treat as unspecified (blocked)
  if (!normalized) return true;

  const strictIp = parseCanonicalIpAddress(normalized);
  if (strictIp) {
    if (strictIp.kind() === 'ipv4') return isBlockedSpecialUseIpv4Address(strictIp as ipaddr.IPv4, policy);
    const v6 = strictIp as ipaddr.IPv6;
    if (isBlockedSpecialUseIpv6Address(v6, policy)) return true;
    const embeddedIpv4 = extractEmbeddedIpv4FromIpv6(v6);
    if (embeddedIpv4) return isBlockedSpecialUseIpv4Address(embeddedIpv4, policy);
    return false;
  }

  if (normalized.includes(':') && !parseLooseIpAddress(normalized)) return true;
  if (!isCanonicalDottedDecimalIPv4(normalized) && isLegacyIpv4Literal(normalized)) return true;
  if (looksLikeUnsupportedIpv4Literal(normalized)) return true;
  return false;
}

function isBlockedHostnameOrIp(hostname: string, policy?: NavigationDiagnosticsPolicy): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return isBlockedHostnameNormalized(normalized) || isPrivateIpAddress(normalized, policy);
}

// Trusted (explicitly allow-listed, non-fully-permissive) address guards.

const CLOUD_METADATA_IPV4 = ['169.254.169.254', '100.100.100.200'];

function isCloudMetadataOrLinkLocalIpv4(v4: ipaddr.IPv4): boolean {
  if (v4.range() === 'linkLocal') return true;
  return CLOUD_METADATA_IPV4.some((m) => v4.toNormalizedString() === ipaddr.IPv4.parse(m).toNormalizedString());
}

function isCloudMetadataOrLinkLocalAddress(address: string): boolean {
  const parsed = parseCanonicalIpAddress(address);
  if (!parsed) return false;
  if (parsed.kind() === 'ipv4') return isCloudMetadataOrLinkLocalIpv4(parsed as ipaddr.IPv4);
  const v6 = parsed as ipaddr.IPv6;
  if (v6.range() === 'linkLocal') return true;
  if (CLOUD_METADATA_IPV6.some((m) => v6.toNormalizedString() === ipaddr.IPv6.parse(m).toNormalizedString()))
    return true;
  const embedded = extractEmbeddedIpv4FromIpv6(v6);
  return embedded ? isCloudMetadataOrLinkLocalIpv4(embedded) : false;
}

function isLoopbackIpAddressIncludingEmbeddedIpv4(address: string): boolean {
  const parsed = parseCanonicalIpAddress(address);
  if (!parsed) return false;
  if (parsed.range() === 'loopback') return true;
  if (parsed.kind() === 'ipv4') return false;
  return extractEmbeddedIpv4FromIpv6(parsed as ipaddr.IPv6)?.range() === 'loopback';
}

function isExplicitLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.localhost') ||
    isLoopbackIpAddressIncludingEmbeddedIpv4(hostname)
  );
}

function isUnspecifiedIpAddressIncludingEmbeddedIpv4(address: string): boolean {
  const parsed = parseCanonicalIpAddress(address);
  if (!parsed) return false;
  if (parsed.kind() === 'ipv4') return parsed.range() === 'unspecified';
  if (parsed.range() === 'unspecified') return true;
  if (parsed.range() === 'loopback') return false;
  return extractEmbeddedIpv4FromIpv6(parsed as ipaddr.IPv6)?.range() === 'unspecified';
}

// ── Constants mirrored from security.ts ──

const NETWORK_NAVIGATION_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_NON_NETWORK_URLS = new Set(['about:blank']);

// ── Diagnostics engine ──

function passedCheck(name: NavigationCheckName): NavigationDiagnosticsCheck {
  return { name, passed: true, skipped: false };
}

function skippedCheck(name: NavigationCheckName): NavigationDiagnosticsCheck {
  return { name, passed: true, skipped: true };
}

function failedCheck(
  name: NavigationCheckName,
  failureReason: NavigationBlockReason,
  failureMessage: string,
): NavigationDiagnosticsCheck {
  return { name, passed: false, skipped: false, failureReason, failureMessage };
}

/**
 * Diagnose whether a browser navigation would be allowed, without performing
 * any I/O. See {@link NavigationDiagnosticsInput} /
 * {@link NavigationDiagnosticsResult} for the data contract.
 *
 * For any given `(url, policy, resolvedAddresses)` triple, the `allow`/`block`
 * verdict matches `assertBrowserNavigationAllowed` driven by a `lookupFn` that
 * returns the mapped addresses. When no mapping is supplied, hostnames that
 * survive the synchronous checks return `needs-resolution` instead of guessing.
 */
export function diagnoseBrowserNavigationPolicy(input: NavigationDiagnosticsInput): NavigationDiagnosticsResult {
  const policy: NavigationDiagnosticsPolicy = input.policy ?? {};
  const allowPrivateNetwork = isPrivateNetworkAllowedByPolicy(policy);
  const checks: NavigationDiagnosticsCheck[] = [];
  // Only knowable once a valid URL is parsed; stays false for pre-parse blocks.
  let ipLiteralKnown = false;

  const block = (
    check: NavigationDiagnosticsCheck,
    remainingChecks: NavigationCheckName[],
  ): NavigationDiagnosticsResult => {
    checks.push(check);
    for (const name of remainingChecks) checks.push(skippedCheck(name));
    return {
      verdict: 'block',
      blockReason: check.failureReason,
      blockMessage: check.failureMessage,
      isIpLiteral: ipLiteralKnown,
      skipPrivateNetworkChecks: allowPrivateNetwork,
      checks,
    };
  };

  // 1. Empty URL
  const rawUrl = input.url.trim();
  if (rawUrl === '') {
    return block(failedCheck('empty-url', 'empty-url', 'url is required'), [
      'invalid-url',
      'userinfo',
      'protocol',
      'proxy-fail-close',
      'require-allowlisted-hostnames',
      'blocked-hostnames',
      'hostname-allowlist',
      'hostname-private-network',
      'dns-resolution',
      'resolved-addresses',
    ]);
  }
  checks.push(passedCheck('empty-url'));

  // 2. Invalid URL. Never echo a credential-bearing input back.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return block(
      failedCheck(
        'invalid-url',
        'invalid-url',
        rawUrl.includes('@') ? 'Invalid URL: [redacted credential-bearing URL]' : `Invalid URL: "${rawUrl}"`,
      ),
      [
        'userinfo',
        'protocol',
        'proxy-fail-close',
        'require-allowlisted-hostnames',
        'blocked-hostnames',
        'hostname-allowlist',
        'hostname-private-network',
        'dns-resolution',
        'resolved-addresses',
      ],
    );
  }
  checks.push(passedCheck('invalid-url'));

  // 3. URL-embedded credentials — describe generically, never echo the secret.
  if (parsed.username || parsed.password) {
    return block(
      failedCheck(
        'userinfo',
        'url-userinfo',
        'Navigation blocked: URL-embedded credentials are not supported for page navigation. ' +
          'Set HTTP Basic auth with `page.setHttpCredentials()` instead.',
      ),
      [
        'protocol',
        'proxy-fail-close',
        'require-allowlisted-hostnames',
        'blocked-hostnames',
        'hostname-allowlist',
        'hostname-private-network',
        'dns-resolution',
        'resolved-addresses',
      ],
    );
  }
  checks.push(passedCheck('userinfo'));

  // 4. Protocol — only http/https, with about:blank as the sole exception.
  if (!NETWORK_NAVIGATION_PROTOCOLS.has(parsed.protocol)) {
    if (SAFE_NON_NETWORK_URLS.has(parsed.href)) {
      checks.push(passedCheck('protocol'));
      for (const name of [
        'proxy-fail-close',
        'require-allowlisted-hostnames',
        'blocked-hostnames',
        'hostname-allowlist',
        'hostname-private-network',
        'dns-resolution',
        'resolved-addresses',
      ] as NavigationCheckName[])
        checks.push(skippedCheck(name));
      return {
        verdict: 'allow',
        isIpLiteral: false,
        skipPrivateNetworkChecks: allowPrivateNetwork,
        checks,
      };
    }
    return block(
      failedCheck('protocol', 'unsupported-protocol', `Navigation blocked: unsupported protocol "${parsed.protocol}"`),
      [
        'proxy-fail-close',
        'require-allowlisted-hostnames',
        'blocked-hostnames',
        'hostname-allowlist',
        'hostname-private-network',
        'dns-resolution',
        'resolved-addresses',
      ],
    );
  }
  checks.push(passedCheck('protocol'));

  // 5. Proxy fail-close (environment proxy, then explicit browser proxy).
  if (input.hasEnvironmentProxy === true && !allowPrivateNetwork) {
    return block(
      failedCheck(
        'proxy-fail-close',
        'environment-proxy-fail-close',
        'Navigation blocked: strict browser SSRF policy cannot be enforced while env proxy variables are set',
      ),
      [
        'require-allowlisted-hostnames',
        'blocked-hostnames',
        'hostname-allowlist',
        'hostname-private-network',
        'dns-resolution',
        'resolved-addresses',
      ],
    );
  }
  if (input.browserProxyMode === 'explicit-browser-proxy' && !allowPrivateNetwork) {
    return block(
      failedCheck(
        'proxy-fail-close',
        'browser-proxy-fail-close',
        'Navigation blocked: strict browser SSRF policy cannot be enforced while this browser is proxy-routed',
      ),
      [
        'require-allowlisted-hostnames',
        'blocked-hostnames',
        'hostname-allowlist',
        'hostname-private-network',
        'dns-resolution',
        'resolved-addresses',
      ],
    );
  }
  checks.push(passedCheck('proxy-fail-close'));

  const normalizedHostname = normalizeHostname(parsed.hostname);
  const ipLiteral = isIpLiteralHostname(parsed.hostname);
  ipLiteralKnown = ipLiteral;

  // 6. requireAllowlistedHostnames gate.
  if (
    policy.requireAllowlistedHostnames === true &&
    !allowPrivateNetwork &&
    !ipLiteral &&
    !isExplicitlyAllowedBrowserHostname(parsed.hostname, policy)
  ) {
    return block(
      failedCheck(
        'require-allowlisted-hostnames',
        'require-allowlisted-hostnames',
        'Navigation blocked: ssrfPolicy.requireAllowlistedHostnames requires an IP-literal URL or an allow-listed ' +
          'hostname, because the browser resolves DNS itself and a hostname cannot be protected against rebinding. ' +
          'Add the hostname to ssrfPolicy.allowedHostnames or navigate by IP.',
      ),
      ['blocked-hostnames', 'hostname-allowlist', 'hostname-private-network', 'dns-resolution', 'resolved-addresses'],
    );
  }
  checks.push(passedCheck('require-allowlisted-hostnames'));

  // ── resolvePinnedHostnameWithPolicy phase ──

  if (!normalizedHostname) {
    return block(failedCheck('blocked-hostnames', 'invalid-hostname', `Invalid hostname: "${parsed.hostname}"`), [
      'hostname-allowlist',
      'hostname-private-network',
      'dns-resolution',
      'resolved-addresses',
    ]);
  }

  const allowedHostnames = normalizeHostnameSet(policy.allowedHostnames);
  const hostnameAllowlist = normalizeHostnameAllowlist(policy.hostnameAllowlist);
  const isExplicitlyAllowed = allowedHostnames.has(normalizedHostname);
  const skipPrivateNetworkChecks = allowPrivateNetwork || isExplicitlyAllowed;

  // 7. blockedHostnames (patterns, takes precedence over private exemptions).
  const blockedPatterns = normalizeHostnameAllowlist(policy.blockedHostnames);
  if (blockedPatterns.some((pattern) => isHostnameAllowedByPattern(normalizedHostname, pattern))) {
    return block(
      failedCheck(
        'blocked-hostnames',
        'blocked-hostname',
        `Navigation blocked: hostname "${parsed.hostname}" is in the configured blocklist.`,
      ),
      ['hostname-allowlist', 'hostname-private-network', 'dns-resolution', 'resolved-addresses'],
    );
  }
  checks.push(passedCheck('blocked-hostnames'));

  // 8. hostnameAllowlist restriction (empty = no restriction).
  if (!matchesHostnameAllowlist(normalizedHostname, hostnameAllowlist)) {
    return block(
      failedCheck(
        'hostname-allowlist',
        'hostname-not-in-allowlist',
        `Navigation blocked: hostname "${parsed.hostname}" is not in the allowlist.`,
      ),
      ['hostname-private-network', 'dns-resolution', 'resolved-addresses'],
    );
  }
  checks.push(passedCheck('hostname-allowlist'));

  // 9. Synchronous hostname/IP private-network check.
  if (!skipPrivateNetworkChecks) {
    if (isBlockedHostnameOrIp(normalizedHostname, policy)) {
      return block(
        failedCheck(
          'hostname-private-network',
          'hostname-private-network',
          `Navigation to internal/loopback address blocked: "${parsed.hostname}". ` +
            'ssrfPolicy.dangerouslyAllowPrivateNetwork is false (strict mode).',
        ),
        ['dns-resolution', 'resolved-addresses'],
      );
    }
    checks.push(passedCheck('hostname-private-network'));
  } else {
    checks.push(skippedCheck('hostname-private-network'));
  }

  // 10. DNS resolution from the supplied snapshot (no real lookup is ever made).
  const resolutionMap = input.resolvedAddresses;
  let resolvedAddresses: string[] | undefined;
  if (resolutionMap !== undefined) {
    const mapped = lookupAddressSnapshot(resolutionMap, normalizedHostname);
    if (mapped === undefined || mapped.length === 0) {
      return block(
        failedCheck(
          'dns-resolution',
          'unable-to-resolve',
          `Navigation to internal/loopback address blocked: unable to resolve "${parsed.hostname}". ` +
            'ssrfPolicy.dangerouslyAllowPrivateNetwork is false (strict mode).',
        ),
        ['resolved-addresses'],
      );
    }
    resolvedAddresses = mapped;
    checks.push(passedCheck('dns-resolution'));
  } else if (ipLiteral) {
    // Node's dns.lookup returns an IP literal verbatim with no network activity,
    // so an IP-literal URL needs no external data: the literal is its own sole
    // resolved address and the verdict remains fully determined.
    resolvedAddresses = [normalizedHostname];
    checks.push(passedCheck('dns-resolution'));
  } else {
    checks.push(skippedCheck('dns-resolution'));
  }

  // 11. Per-resolved-address validation.
  if (resolvedAddresses === undefined) {
    checks.push(skippedCheck('resolved-addresses'));
    return {
      verdict: 'needs-resolution',
      isIpLiteral: ipLiteral,
      skipPrivateNetworkChecks,
      checks,
    };
  }

  if (!skipPrivateNetworkChecks) {
    for (const address of resolvedAddresses) {
      if (isBlockedHostnameOrIp(address, policy)) {
        const check = failedCheck(
          'resolved-addresses',
          'resolved-address-private-network',
          `Navigation to internal/loopback address blocked: "${parsed.hostname}" resolves to "${address}". ` +
            'ssrfPolicy.dangerouslyAllowPrivateNetwork is false (strict mode).',
        );
        checks.push(check);
        return finishTrustedBlock(
          checks,
          check.failureReason ?? 'resolved-address-private-network',
          check.failureMessage,
          ipLiteral,
          skipPrivateNetworkChecks,
        );
      }
    }
  } else if (isExplicitlyAllowed && !allowPrivateNetwork) {
    // DNS-rebinding defense for trusted hostnames: unspecified/loopback (unless
    // the hostname itself is loopback), cloud-metadata/link-local, special IPv6.
    const loopbackAllowed = isExplicitLoopbackHostname(normalizedHostname);
    for (const address of resolvedAddresses) {
      if (isUnspecifiedIpAddressIncludingEmbeddedIpv4(address)) {
        const check = failedCheck(
          'resolved-addresses',
          'resolved-address-unspecified',
          `Navigation blocked: allow-listed hostname "${parsed.hostname}" resolves to an unspecified address "${address}".`,
        );
        checks.push(check);
        return finishTrustedBlock(
          checks,
          check.failureReason ?? 'resolved-address-unspecified',
          check.failureMessage,
          ipLiteral,
          skipPrivateNetworkChecks,
        );
      }
      if (!loopbackAllowed && isLoopbackIpAddressIncludingEmbeddedIpv4(address)) {
        const check = failedCheck(
          'resolved-addresses',
          'resolved-address-loopback',
          `Navigation blocked: allow-listed hostname "${parsed.hostname}" resolves to a loopback address "${address}".`,
        );
        checks.push(check);
        return finishTrustedBlock(
          checks,
          check.failureReason ?? 'resolved-address-loopback',
          check.failureMessage,
          ipLiteral,
          skipPrivateNetworkChecks,
        );
      }
      if (isCloudMetadataOrLinkLocalAddress(address)) {
        const check = failedCheck(
          'resolved-addresses',
          'resolved-address-cloud-metadata',
          `Navigation blocked: allow-listed hostname "${parsed.hostname}" resolves to a cloud-metadata/link-local address "${address}".`,
        );
        checks.push(check);
        return finishTrustedBlock(
          checks,
          check.failureReason ?? 'resolved-address-cloud-metadata',
          check.failureMessage,
          ipLiteral,
          skipPrivateNetworkChecks,
        );
      }
      if (isBlockedTrustedResolvedIpv6Address(address)) {
        const check = failedCheck(
          'resolved-addresses',
          'resolved-address-special-ipv6',
          `Navigation blocked: allow-listed hostname "${parsed.hostname}" resolves to a special-use IPv6 address "${address}".`,
        );
        checks.push(check);
        return finishTrustedBlock(
          checks,
          check.failureReason ?? 'resolved-address-special-ipv6',
          check.failureMessage,
          ipLiteral,
          skipPrivateNetworkChecks,
        );
      }
    }
  }

  checks.push(passedCheck('resolved-addresses'));
  return {
    verdict: 'allow',
    isIpLiteral: ipLiteral,
    skipPrivateNetworkChecks,
    checks,
  };
}

function finishTrustedBlock(
  checks: NavigationDiagnosticsCheck[],
  reason: NavigationBlockReason,
  message: string | undefined,
  isIpLiteral: boolean,
  skipPrivateNetworkChecks: boolean,
): NavigationDiagnosticsResult {
  return {
    verdict: 'block',
    blockReason: reason,
    blockMessage: message,
    isIpLiteral,
    skipPrivateNetworkChecks,
    checks,
  };
}

/**
 * Resolve a hostname against the caller-supplied snapshot, applying the same
 * normalization security.ts uses (case folding, trailing dot, IPv6 brackets).
 * Returns `undefined` when the snapshot contains no usable entry.
 */
function lookupAddressSnapshot(map: Record<string, string[]>, normalizedHostname: string): string[] | undefined {
  if (Object.hasOwn(map, normalizedHostname)) return map[normalizedHostname];
  for (const [key, value] of Object.entries(map)) {
    if (normalizeHostname(key) === normalizedHostname) return value;
  }
  return undefined;
}
