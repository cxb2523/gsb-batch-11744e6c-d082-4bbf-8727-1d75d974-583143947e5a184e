# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through **[GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)** —
the **Security** tab of this repository, then **Report a vulnerability**. The
report stays private between you and the maintainers.

If you would rather not use GitHub, email **contact@stratzi.ai**.

A useful report usually has:

- what the issue is and roughly how bad you think it is,
- the steps to reproduce it, ideally the smallest case that works,
- the version or commit you tested, and whether you ran it via Docker or manually,
- anything you already know about who is affected or how to mitigate it.

Proof-of-concept code is welcome. If you cannot share something publicly, say
so and we will find another way.

## What happens next

| | |
|---|---|
| We acknowledge your report | within 3 working days |
| We tell you whether we can reproduce it, and our assessment | within 10 working days |
| We aim to ship a fix | within 90 days of the report |

If a report goes quiet for longer than that, please chase us — a missed
message is far more likely than a decision to ignore you.

We will credit you in the advisory and the release notes unless you would
rather stay anonymous. We do not run a paid bug bounty.

Please give us a reasonable chance to ship a fix before disclosing publicly.
If 90 days pass without a fix and without us agreeing a longer timeline with
you, publish — that deadline is yours to enforce, not ours to extend
unilaterally.

## Supported versions

This project has not reached 1.0. Only the latest release receives security
fixes; there are no maintained backport branches, and older tags will not be
patched.

If you self-host, track releases and upgrade. Upgrading is a pull, rebuild and
restart — see the [self-hosting guide](docs/self-hosting.md).

## Scope

**In scope** — anything in this repository that lets someone:

- sign in as another user, or act with permissions they should not have,
- read or change data in a project they are not a member of,
- escalate from a regular user to an administrator,
- extract secrets, tokens or credentials from the running application,
- execute code on the server, or read files outside the intended upload paths.

**Out of scope:**

- Findings that need an operator to have already misconfigured their instance
  in a way this project explicitly warns against — see
  [Deployment expectations](#deployment-expectations) below.
- Vulnerabilities in a dependency with no demonstrated impact here. Report
  those upstream; tell us too if this project's usage makes them exploitable.
- Missing hardening headers, rate limits or cookie flags with no concrete
  exploit path. Still worth a normal issue or pull request — just not a
  private advisory.
- Denial of service through sheer traffic volume, and social engineering of
  maintainers or operators.
- Findings against a demo or third-party instance you do not operate. Test
  against your own.

## Deployment expectations

This is self-hosted software, so some of its security depends on how you run
it. These are the defaults that matter; all of them are covered in the
[self-hosting guide](docs/self-hosting.md).

- **Set a real `APP_SECRET_KEY`.** It signs every session. The application
  refuses to start outside `development` while it is the placeholder, which is
  the intended behaviour rather than a bug.
- **Set `APP_ALLOWED_DOMAINS`** if you enable Google sign-in. It is empty
  by default, and empty means any Google account can create an account on your
  instance.
- **Leave `APP_SERVICE_KEY` empty** unless you specifically need
  service-to-service impersonation and your instance is network-restricted.
  `backend/.env.example` explains what it does and why it is off by default.
- **Serve over HTTPS.** Session cookies are issued with the `Secure` flag, so
  plain HTTP will not keep anyone signed in — and should not be used anyway.
- **Keep MongoDB off the public internet.** Nothing in this project
  authenticates to the database on your behalf; that is your deployment's job.

## Credentials in your own instance

If you believe credentials for *your* deployment have leaked — a secret key, a
service key, OAuth client secrets — that is an incident on your side, not a
vulnerability in this project. Rotate the values, restart, and have affected
users change their passwords. We are happy to help you work out the blast
radius; open a normal issue or email the address above.
