# Contributing conventions

Short, durable rules that apply across every Dev/Test/BA cycle. Keep this file small —
it's meant to be read once and then followed by habit, not re-derived every session.

## UI copy must be English-only

**Rule:** every piece of user-facing text in the product — labels, buttons, nav items,
headings, placeholder text, validation/error messages, empty states, toasts, tooltips,
emails, and any content in seed/demo data — is written in English. No exceptions.

This is Requirement row 1 (`docs/requirements-raw.md`) and Guiding Principle 3
(`docs/PROJECT_PLAN.md`), restated here so it's enforced mechanically during review
instead of re-derived from those docs each time:

- Applies to both `/client` (React components, copy constants, form labels) and
  `/server` (API error messages returned to the client, validation messages).
- Internal project docs (`docs/PROJECT_PLAN.md`, `docs/BACKLOG.md`,
  `docs/PROGRESS_LOG.md`, code comments) are also kept in English for team
  consistency — this repo's working language is English end to end.
- The one allowed exception: quoting a literal Vietnamese customer/domain term where it
  adds clarity (e.g. "mã đề" for a test variant code), always alongside its English
  explanation, never as the only label shown to a user.
- Hardcoded non-English user-facing strings are a review-blocking defect, the same
  severity as a broken theme-token rule (see below) — flag and fix before merging.

## Use Tailwind theme tokens, not ad-hoc hex/colors

`client/tailwind.config.js` defines the project's palette (`primary` — pastel
orange-red — plus `white`/`black` as base colors, per the top-of-doc color directive in
`docs/requirements-raw.md`). Components use theme classes (`bg-primary-500`,
`text-primary-700`, `bg-white`, `text-black`, ...) — never a one-off hex value in a
`style` prop or an arbitrary Tailwind bracket value (`bg-[#f2694a]`) for something the
theme already expresses. If a new visual need doesn't fit the existing tokens, extend
`tailwind.config.js` first, then use the new token — don't reach for a raw hex code in a
component.
