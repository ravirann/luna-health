# Security Policy

Thanks for helping keep Luna and the people who use it safe. This
document covers how to report a vulnerability, what to expect after you
report one, and what's in and out of scope.

## Reporting a vulnerability

Please report suspected security vulnerabilities privately — not in a
public GitHub issue, discussion, or pull request.

**Preferred: GitHub Security Advisories.** Open a private advisory from
this repository's Security tab ("Report a vulnerability"). This lets you
share details with maintainers privately and track a fix through to
disclosure without exposing the issue while it's open.

**Fallback: email.** If you can't use GitHub Security Advisories, reach
the maintainers via GitHub.
<!-- TODO(maintainer): add contact email -->
Please include steps to reproduce, the affected version or commit, and
what you think the impact is.

Please don't open a public issue for a suspected vulnerability, even a
minor-looking one, until a maintainer has confirmed it's safe to
disclose.

## What to expect

We aim to acknowledge new reports within **72 hours**. This is a draft
target, not a guaranteed SLA — revisit once the maintainer team and
process are settled.

After acknowledgement, a maintainer will work with you to confirm the
issue, assess severity, and agree on a fix and disclosure timeline.

## Scope

Luna is software you can self-host. This policy covers the code in this
repository:

- **In scope** — vulnerabilities in `server/`, `web/`, or their
  configuration and deployment files as they exist in this repo (for
  example: auth bypass, injection, broken access control, unsafe
  defaults, secrets handling).
- **Out of scope** — any specific live, hosted deployment that you don't
  personally operate. If you find a problem by probing someone else's
  running instance rather than by reading the code, report it to
  whoever operates that instance, not here, and stop testing against it.

If you're not sure whether something is in scope, report it anyway and
let a maintainer make the call.

## Conversation data is sensitive

Luna handles voice conversations, transcripts, and memory derived from
them, often about difficult or personal things. If your testing touches
a live instance you don't own:

- Do not intentionally access, read, or extract another user's
  conversations, transcripts, recordings, or derived memory — including
  through another account, a misconfigured endpoint, or an
  access-control bug. Use your own test data, and stop as soon as you've
  confirmed the issue exists.
- If you believe you've already seen another user's data as a side
  effect of testing, say so in your report, describe only what's needed
  to demonstrate the bug, and don't retain, share, or access it further.
