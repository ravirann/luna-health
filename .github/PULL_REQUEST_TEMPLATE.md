## What changed and why

<!-- The "why" matters more than the "what" — link an issue if there is one. -->

## How was this verified?

<!-- A manual call walkthrough, new/updated automated tests, or both. -->

## Checklist

- [ ] `cd web && npx tsc --noEmit && npm test && npx next build` passes (if `web/` changed)
- [ ] `cd server && .venv/bin/python -m pytest -q` passes (if `server/` changed)
- [ ] Copy changes checked against `DESIGN.md` §2 (banned vocabulary + the safety-copy exemption)
- [ ] **Touches safety-critical code?** (crisis detection, crisis copy, `/safety` page, or memory/data handling — see `CLAUDE.md`) → flag it below and expect a maintainer review pass before merge, not a quick approve.

**Safety note:** if this PR changes a crisis-resource contact (phone
number, link, hours), the numbers must be re-verified against that
service's current published details before merge — don't carry forward an
old value on trust. See the `NOTE(safety)` comment above
`DEFAULT_CRISIS_RESOURCES` in `server/luna_bot/voice/safety.py`.
