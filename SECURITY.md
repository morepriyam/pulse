# Security Policy

## Reporting a Vulnerability

Pulse takes security seriously — especially given its focus on capturing and
handling institutional video/audio on-device and uploading to self-hosted
PulseVault servers.

**Please do not open a public GitHub issue for security vulnerabilities.**
Publicly disclosing a vulnerability before it's patched puts users at risk.

Instead, report it privately using one of these channels:

1. **Preferred:** Use GitHub's [private vulnerability reporting](https://github.com/mieweb/pulse/security/advisories/new)
   for this repository. This opens a private advisory that only maintainers
   can see, and lets us collaborate with you on a fix before anything is
   disclosed publicly.
2. **Alternative:** Email [info@mieweb.com](mailto:info@mieweb.com) with a
   description of the issue, steps to reproduce, and any relevant
   proof-of-concept. Please use a subject line starting with `[SECURITY]`.

### What to include in your report

- A clear description of the vulnerability and its potential impact
- Steps to reproduce, or a minimal proof-of-concept
- The affected version(s) and platform (iOS/Android), if applicable
- Any suggested remediation, if you have one

### What to expect

- **Acknowledgement:** within 3 business days of your report
- **Triage & updates:** we'll confirm the issue and share a rough timeline
  for a fix, with periodic status updates until resolved
- **Disclosure:** we'll coordinate a disclosure timeline with you once a fix
  is available. We're happy to credit reporters in the release notes/advisory
  unless you'd prefer to remain anonymous

## Supported Versions

Pulse follows a rolling-release model — only the latest published release
is actively supported with security fixes; fixes are not backported to
older releases.

| Version      | Supported          |
| ------------ | ------------------ |
| 2.x (latest) | :white_check_mark: |
| < 2.0        | :x:                |

## Scope

This policy covers the Pulse mobile app in this repository, including its
build tooling and direct dependencies. For vulnerabilities in:

- **PulseVault** (the self-hosted upload server) — report against the
  [PulseVault repository](https://github.com/mieweb/pulsevault) instead.
- **Upstream dependencies** (e.g. Expo, React Native, or other third-party
  packages) — please report to the upstream project directly. If you're
  unsure whether an issue originates in Pulse or a dependency, report it to
  us and we'll help route it correctly.

## Dependency Security

Pulse uses GitHub's Dependabot for automated dependency vulnerability
scanning and security update PRs. Known, unresolved advisories affecting
third-party dependencies (where no upstream fix is yet available) are
tracked and reviewed regularly rather than being silently ignored.
