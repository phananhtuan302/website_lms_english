# Integrations requiring customer-supplied credentials

This file lists every part of the product that is **fully built against a mock/stub** and
only needs real third-party credentials/accounts swapped in when the customer provides them.
Nothing here is allowed to block progress — per `TECH_STACK.md`'s integration rule, Dev builds
the full business logic + UI + data flow against a mock/stub, logs it here, and moves on.

| Integration | Code location | What customer must supply | Current mock/stub | How to activate |
|---|---|---|---|---|
| AI Speaking-grading provider (`AIGradingProvider`) | Not yet implemented — planned for `T-051` (`server/src/grading/` or similar, per `TECH_STACK.md`'s `AIGradingProvider` interface design). Speaking question type itself is `T-052`–`T-056`. | A real AI provider API key (e.g. an Anthropic API key) capable of scoring spoken-English transcripts/audio and producing written feedback. | Not built yet. When `T-051` lands, the only registered implementation will be `MockAIGradingProvider` — a documented heuristic (e.g. transcript length + keyword overlap with the prompt) that needs no key, so the full Speaking flow (T-052–T-056) works end-to-end in dev. | Implement a new class satisfying the `AIGradingProvider` interface (same method signature: audio/transcript + prompt in, score + feedback out), register it in the provider factory/DI point instead of `MockAIGradingProvider`, and add the API key to `server/.env` (`.env.example` will list the new required var at that time). No business-logic changes needed elsewhere — grading, storage, and review UI are provider-agnostic by design. |
| Hosting / domain / CI-CD | N/A — no infra provisioned yet. Placeholder tracked fully in `T-058`. | Domain name, hosting provider/budget preference, and any CI/CD platform preference, once the customer is ready to go beyond local dev. | Local dev only (`npm run dev` at the repo root). No deployment pipeline exists. | Out of scope until `T-058`. Not detailed further here to avoid duplicating that task's acceptance criteria. |

---

## Notes

- QR code generation (row 4 / `T-010`) and copy-paste / tab-switch detection (rows 10, 20 /
  `T-043`, `T-044`) do **not** need an entry here — per `TECH_STACK.md` they're implemented
  entirely with local libraries (`qrcode` npm package) or browser DOM events, no external
  account or credential of any kind.
- Email sending is not currently planned anywhere in `BACKLOG.md`/`PROJECT_PLAN.md`; if a later
  task introduces it (e.g. password reset), add a row here at that time rather than
  speculatively now.
- When you finish the task that swaps a mock/stub for a real integration, remove or mark that
  row `Activated` in the same change, and note it in `docs/PROGRESS_LOG.md`.
