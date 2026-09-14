# Integrations requiring customer-supplied credentials

This file lists every part of the product that is **fully built against a mock/stub** and
only needs real third-party credentials/accounts swapped in when the customer provides them.
Nothing here is allowed to block progress — per `TECH_STACK.md`'s integration rule, Dev builds
the full business logic + UI + data flow against a mock/stub, logs it here, and moves on.

| Integration | Code location | What customer must supply | Current mock/stub | How to activate |
|---|---|---|---|---|
| AI Speaking-grading provider (`AIGradingProvider`) | **Built (T-051–T-056).** Interface: `server/src/grading/aiGradingProvider.ts` (`AIGradingProvider.grade(transcript, audioReference, prompt): Promise<{ score, feedback }>`). Mock implementation: `server/src/grading/mockAIGradingProvider.ts` (`MockAIGradingProvider`). Factory/swap point: `server/src/grading/index.ts`'s `getAIGradingProvider()`, called from `POST /api/attempts/:attemptId/questions/:questionId/speaking-answer` in `server/src/routes/attempts.routes.ts` (T-054). Speaking question authoring is `teacherTests.routes.ts`/`TeacherTestEditorPage.tsx` (T-052); client recording + draft transcript is `TakeTestPage.tsx` (T-053); teacher override is `TeacherAttemptDetailPage.tsx` (T-055); student view is `AttemptResultPage.tsx` (T-056). | A real AI provider API key (e.g. an Anthropic API key) capable of scoring spoken-English transcripts/audio and producing written feedback. | `MockAIGradingProvider` — a documented heuristic (word count, capped at 60 pts, + keyword overlap with the prompt's content words, capped at 40 pts, clamped to 0–100; see the class's doc comment for the exact formula) that needs no key. It is the ONLY registered provider today (`AI_GRADING_PROVIDER` env var defaults to `mock`), so the full Speaking flow (T-052–T-056) works end-to-end in dev, including the "browser doesn't support Web Speech API" case (empty transcript still grades, just scores 0 with an explanatory feedback message instead of failing). | 1. Implement a new class satisfying `AIGradingProvider` (same `grade(transcript, audioReference, prompt)` signature) in `server/src/grading/`. 2. Register it in the `switch` in `server/src/grading/index.ts`'s `getAIGradingProvider()`. 3. Add the real API key as a new required var in `server/.env` (and document it in `.env.example`). 4. Set `AI_GRADING_PROVIDER` to the new provider's name in `.env`. No other file needs to change — submission, storage (see the note below on audio storage), and the teacher-override/student-view UI are all provider-agnostic by design; they only ever see `{ score, feedback }`. Note: recorded audio itself is stored as a base64 `data:` URL directly on the `Answer` row (`server/src/routes/attempts.routes.ts`'s module doc comment) — there is no object-storage/CDN integration to swap here, that's a storage mechanism Dev controls, not a third-party credential, so it isn't tracked as its own row in this table. |
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
