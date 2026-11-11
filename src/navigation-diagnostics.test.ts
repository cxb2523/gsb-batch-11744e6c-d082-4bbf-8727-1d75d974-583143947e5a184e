import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  diagnoseBrowserNavigationPolicy,
  type NavigationBlockReason,
  type NavigationCheckName,
  type NavigationDiagnosticsInput,
} from './navigation-diagnostics.js';
import { assertBrowserNavigationAllowed, InvalidBrowserNavigationUrlError } from './security.js';
import type { LookupFn } from './security.js';
import type { SsrfPolicy } from './types.js';

// ── Helpers ──

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'] as const;

/** Run a callback with all proxy env vars temporarily cleared (mirrors security.test.ts). */
async function withoutProxyEnv(fn: () => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(PROXY_ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of PROXY_ENV_KEYS) Reflect.deleteProperty(process.env, k);
  try {
    await fn();
  } finally {
    for (const k of PROXY_ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  }
}

function normalizeHost(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

/** Build a lookupFn from a hostname→addresses map, mirroring an injected DNS snapshot. */
function lookupFromMap(map: Record<string, string[]>): LookupFn {
  const normalized: Record<string, string[]> = {};
  for (const [key, addresses] of Object.entries(map)) normalized[normalizeHost(key)] = addresses;
  const fn = (hostname: string) => {
    const addresses = normalized[normalizeHost(hostname)] ?? [];
    return Promise.resolve(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  };
  return fn as unknown as LookupFn;
}

/**
 * Assert the diagnostics verdict matches a real `assertBrowserNavigationAllowed`
 * call driven by a lookupFn returning the same mapped addresses.
 */
async function expectParity(input: NavigationDiagnosticsInput): Promise<void> {
  const diagnosis = diagnoseBrowserNavigationPolicy(input);
  const policy = input.policy as SsrfPolicy | undefined;
  const runReal = async (): Promise<void> => {
    await assertBrowserNavigationAllowed({
      url: input.url,
      ssrfPolicy: policy,
      browserProxyMode: input.browserProxyMode ?? 'direct',
      ...(input.resolvedAddresses !== undefined ? { lookupFn: lookupFromMap(input.resolvedAddresses) } : {}),
    });
  };

  if (diagnosis.verdict === 'block') {
    await expect(runReal()).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
  } else if (diagnosis.verdict === 'allow') {
    await expect(runReal()).resolves.toBeUndefined();
  } else {
    throw new Error(`Parity harness expects a definitive verdict, got needs-resolution for ${input.url}`);
  }
}

const EXPECTED_CHECK_ORDER: NavigationCheckName[] = [
  'empty-url',
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
];

describe('diagnoseBrowserNavigationPolicy', () => {
  beforeEach(() => {
    for (const k of PROXY_ENV_KEYS) Reflect.deleteProperty(process.env, k);
  });

  afterEach(() => {
    for (const k of PROXY_ENV_KEYS) Reflect.deleteProperty(process.env, k);
  });

  describe('happy path', () => {
    it('allows a legitimate public URL with an empty policy and matches the real assertion', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'https://public.example.com/index',
          policy: {},
          browserProxyMode: 'direct',
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'public.example.com': ['93.184.216.34'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);

        expect(result.verdict).toBe('allow');
        expect(result.blockReason).toBeUndefined();
        expect(result.isIpLiteral).toBe(false);
        expect(result.skipPrivateNetworkChecks).toBe(false);
        expect(result.checks.map((c) => c.name)).toEqual(EXPECTED_CHECK_ORDER);
        expect(result.checks.every((c) => c.passed)).toBe(true);

        await expectParity(input);
      });
    });

    it('allows a public IP-literal URL without requiring a resolution map', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'http://93.184.216.34/',
          policy: {},
          hasEnvironmentProxy: false,
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('allow');
        expect(result.isIpLiteral).toBe(true);
        await expectParity(input);
      });
    });
  });

  describe('negative path', () => {
    it('blocks a hostname matched by blockedHostnames, matching the real assertion', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'https://denied.public.example.com/',
          policy: { blockedHostnames: ['*.public.example.com'] },
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'denied.public.example.com': ['93.184.216.34'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('blocked-hostname');
        expect(result.blockMessage).toContain('blocklist');
        await expectParity(input);
      });
    });

    it('blocks a hostname that does not match the hostnameAllowlist, matching the real assertion', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'https://outside.allow.example.com/',
          policy: { hostnameAllowlist: ['*.trusted.example.com'] },
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'outside.allow.example.com': ['93.184.216.34'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('hostname-not-in-allowlist');
        expect(result.blockMessage).toContain('not in the allowlist');
        await expectParity(input);
      });
    });

    it('blocks a hostname that resolves to 127.0.0.1, matching the real assertion', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'https://rebind.loopback.example.com/',
          policy: {},
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'rebind.loopback.example.com': ['127.0.0.1'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('resolved-address-private-network');
        expect(result.blockMessage).toContain('127.0.0.1');
        await expectParity(input);
      });
    });
  });

  describe('boundary path', () => {
    it('allows about:blank without any DNS data', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'about:blank',
          policy: {},
          hasEnvironmentProxy: false,
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('allow');
        expect(result.checks.find((c) => c.name === 'protocol')?.passed).toBe(true);
        await expectParity(input);
      });
    });

    it('blocks a URL with embedded userinfo and never leaks the credentials', async () => {
      await withoutProxyEnv(async () => {
        const secretPassword = 'super-secret-password-123';
        const input: NavigationDiagnosticsInput = {
          url: `https://alice:${secretPassword}@userinfo.example.com/`,
          policy: {},
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'userinfo.example.com': ['93.184.216.34'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('url-userinfo');

        const serialized = JSON.stringify(result);
        expect(JSON.parse(serialized)).toEqual(result); // JSON-serializable round trip
        expect(serialized).not.toContain(secretPassword);
        expect(serialized).not.toContain('alice');

        // The real implementation throws for the same reason.
        await expect(
          assertBrowserNavigationAllowed({ url: input.url, ssrfPolicy: input.policy as SsrfPolicy }),
        ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
      });
    });

    it('reports an unresolvable hostname instead of silently allowing it', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'https://missing.dns.example.com/',
          policy: {},
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'some.other.host.example.com': ['93.184.216.34'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('unable-to-resolve');
        expect(result.blockMessage).toContain('unable to resolve');
        // A failing injected lookup makes the real assertion throw too.
        const failingLookup = (() => Promise.reject(new Error('DNS resolution failed'))) as unknown as LookupFn;
        await expect(
          assertBrowserNavigationAllowed({
            url: input.url,
            ssrfPolicy: input.policy as SsrfPolicy,
            lookupFn: failingLookup,
          }),
        ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
      });
    });

    it('treats an empty address list in the map as unresolvable', () => {
      const result = diagnoseBrowserNavigationPolicy({
        url: 'https://empty.dns.example.com/',
        policy: {},
        hasEnvironmentProxy: false,
        resolvedAddresses: { 'empty.dns.example.com': [] },
      });
      expect(result.verdict).toBe('block');
      expect(result.blockReason).toBe('unable-to-resolve');
    });

    it('returns needs-resolution when no address snapshot is supplied for a hostname', () => {
      const result = diagnoseBrowserNavigationPolicy({
        url: 'https://unknown.host.example.com/',
        policy: {},
        hasEnvironmentProxy: false,
      });
      expect(result.verdict).toBe('needs-resolution');
      expect(result.blockReason).toBeUndefined();
      expect(result.checks.find((c) => c.name === 'dns-resolution')?.skipped).toBe(true);
      expect(result.checks.find((c) => c.name === 'resolved-addresses')?.skipped).toBe(true);
    });
  });

  describe('trusted-hostname rebinding defense', () => {
    it('still blocks an explicitly allow-listed hostname that resolves to the cloud metadata address', async () => {
      await withoutProxyEnv(async () => {
        const hostname = 'bastion.metadata.example.com';
        const input: NavigationDiagnosticsInput = {
          url: `https://${hostname}/`,
          policy: { allowedHostnames: [hostname] },
          hasEnvironmentProxy: false,
          resolvedAddresses: { [hostname]: ['169.254.169.254'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('resolved-address-cloud-metadata');
        expect(result.blockMessage).toContain('169.254.169.254');
        expect(result.skipPrivateNetworkChecks).toBe(true);
        expect(result.checks.find((c) => c.name === 'hostname-private-network')?.skipped).toBe(true);
        await expectParity(input);
      });
    });

    it('allows an explicitly allow-listed hostname resolving to an ordinary private IP', async () => {
      await withoutProxyEnv(async () => {
        const hostname = 'bastion.private.example.com';
        const input: NavigationDiagnosticsInput = {
          url: `https://${hostname}/`,
          policy: { allowedHostnames: [hostname] },
          hasEnvironmentProxy: false,
          resolvedAddresses: { [hostname]: ['10.0.0.5'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('allow');
        await expectParity(input);
      });
    });
  });

  describe('early URL-level gates and proxy fail-close', () => {
    it('blocks an empty URL', async () => {
      const result = diagnoseBrowserNavigationPolicy({ url: '   ', hasEnvironmentProxy: false });
      expect(result.verdict).toBe('block');
      expect(result.blockReason).toBe('empty-url');
      await expectParity({ url: '   ' });
    });

    it('blocks an invalid URL without echoing it', async () => {
      const result = diagnoseBrowserNavigationPolicy({ url: 'not a url at all', hasEnvironmentProxy: false });
      expect(result.verdict).toBe('block');
      expect(result.blockReason).toBe('invalid-url');
      await expectParity({ url: 'not a url at all' });
    });

    it('blocks a non-http(s) protocol', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'file:///etc/passwd',
          hasEnvironmentProxy: false,
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('unsupported-protocol');
        await expectParity(input);
      });
    });

    it('fails closed when environment proxy variables are detected', async () => {
      const input: NavigationDiagnosticsInput = {
        url: 'https://proxy.env.example.com/',
        policy: {},
        hasEnvironmentProxy: true,
        resolvedAddresses: { 'proxy.env.example.com': ['93.184.216.34'] },
      };
      const result = diagnoseBrowserNavigationPolicy(input);
      expect(result.verdict).toBe('block');
      expect(result.blockReason).toBe('environment-proxy-fail-close');

      process.env.HTTP_PROXY = 'http://proxy.example.com:8080';
      await expect(
        assertBrowserNavigationAllowed({
          url: input.url,
          ssrfPolicy: input.policy as SsrfPolicy,
          lookupFn: lookupFromMap(input.resolvedAddresses ?? {}),
        }),
      ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);
    });

    it('fails closed for an explicit proxy-routed browser under a strict policy', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'http://93.184.216.34/',
          policy: {},
          browserProxyMode: 'explicit-browser-proxy',
          hasEnvironmentProxy: false,
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('browser-proxy-fail-close');
        await expectParity(input);
      });
    });

    it('blocks an unlisted hostname under requireAllowlistedHostnames', async () => {
      await withoutProxyEnv(async () => {
        const input: NavigationDiagnosticsInput = {
          url: 'https://gated.host.example.com/',
          policy: { requireAllowlistedHostnames: true },
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'gated.host.example.com': ['93.184.216.34'] },
        };
        const result = diagnoseBrowserNavigationPolicy(input);
        expect(result.verdict).toBe('block');
        expect(result.blockReason).toBe('require-allowlisted-hostnames');
        await expectParity(input);
      });
    });
  });

  describe('output contract', () => {
    it('always emits the full ordered check list with valid status flags', () => {
      const result = diagnoseBrowserNavigationPolicy({
        url: 'https://contract.example.com/',
        policy: {},
        hasEnvironmentProxy: false,
        resolvedAddresses: { 'contract.example.com': ['93.184.216.34'] },
      });
      expect(result.checks.map((c) => c.name)).toEqual(EXPECTED_CHECK_ORDER);
      for (const check of result.checks) {
        expect(typeof check.passed).toBe('boolean');
        expect(typeof check.skipped).toBe('boolean');
        if (!check.passed && !check.skipped) {
          expect(check.failureReason).toBeDefined();
          expect(check.failureMessage).toBeDefined();
        }
      }
      // Round-trips through JSON with no loss or non-serializable fields.
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('marks a failed check as the first failure and skips every subsequent check', () => {
      const result = diagnoseBrowserNavigationPolicy({
        url: 'https://skipped.after.fail.example.com/',
        policy: { hostnameAllowlist: ['*.only-this.example.com'] },
        hasEnvironmentProxy: false,
        resolvedAddresses: { 'skipped.after.fail.example.com': ['93.184.216.34'] },
      });
      const failedIndex = result.checks.findIndex((c) => !c.passed);
      expect(result.checks[failedIndex]?.name).toBe('hostname-allowlist');
      expect(result.checks.slice(failedIndex + 1).every((c) => c.skipped)).toBe(true);
    });

    it('never embeds credential material anywhere in the output', () => {
      const secret = 'pw-leak-guard-42';
      const result = diagnoseBrowserNavigationPolicy({
        url: `https://bob:${secret}@leak.example.com/path?x=1`,
        hasEnvironmentProxy: false,
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain('bob');
    });
  });

  describe('reason enum coverage', () => {
    it('uses stable reason identifiers for every documented block path', () => {
      const reasons: NavigationBlockReason[] = [];
      const cases: NavigationDiagnosticsInput[] = [
        { url: '', hasEnvironmentProxy: false },
        { url: 'http://???', hasEnvironmentProxy: false },
        { url: 'https://u:p@r.example.com/', hasEnvironmentProxy: false },
        { url: 'ftp://r.example.com/', hasEnvironmentProxy: false },
        { url: 'https://r.example.com/', hasEnvironmentProxy: true },
        {
          url: 'http://93.184.216.34/',
          browserProxyMode: 'explicit-browser-proxy',
          hasEnvironmentProxy: false,
        },
        {
          url: 'https://g.example.com/',
          policy: { requireAllowlistedHostnames: true },
          hasEnvironmentProxy: false,
        },
        {
          url: 'https://b.example.com/',
          policy: { blockedHostnames: ['b.example.com'] },
          hasEnvironmentProxy: false,
        },
        {
          url: 'https://a.example.com/',
          policy: { hostnameAllowlist: ['nope.example.com'] },
          hasEnvironmentProxy: false,
        },
        { url: 'http://127.0.0.1/', hasEnvironmentProxy: false },
        {
          url: 'https://n.example.com/',
          hasEnvironmentProxy: false,
          resolvedAddresses: {},
        },
        {
          url: 'https://l.example.com/',
          hasEnvironmentProxy: false,
          resolvedAddresses: { 'l.example.com': ['127.0.0.1'] },
        },
      ];
      for (const c of cases) {
        const r = diagnoseBrowserNavigationPolicy(c);
        expect(r.verdict).toBe('block');
        if (r.blockReason) reasons.push(r.blockReason);
      }
      expect(new Set(reasons).size).toBe(reasons.length);
    });
  });
});
