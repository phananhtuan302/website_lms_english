# Local demo dataset

## Run safely

From the repository root:

```powershell
cd server
npx tsx scripts/seed-demo.ts --inspect
npx tsx scripts/seed-demo.ts
npx tsx scripts/verify-demo.ts
```

Dependencies and the migrated schema must already exist. The script loads `server/.env` through `dotenv/config`; run it from `server`, not the repository root. It refuses any target except `localhost`, `127.0.0.1`, or `::1` and database `english_platform_dev`, then checks `current_database()` before writes. It prints no connection credentials.

All generated IDs start with `demo-webeng-v1-`. Bulk inserts use stable IDs and `createMany({ skipDuplicates: true })`; existing records are **never updated or deleted**, including existing demo records. There is no reset, truncation, nested deletion, schema change, or call to the older seed (which has migration/backfill behaviour). A conflicting demo email belonging to a different ID aborts rather than adopting or modifying the account. Partial execution can be safely resumed. This is additive fixture provisioning, not a tool for restoring demo rows after someone edits them.

## Local-only login credentials

Every account below has password **`Demo@2026!`**. This public shared password is for this fictional **local demo only**, never production.

- Administrator: `demo.admin@demo.webeng.test`
- Teachers: `demo.teacher1@demo.webeng.test` through `demo.teacher8@demo.webeng.test`
- Students: `demo.student001@demo.webeng.test` through `demo.student480@demo.webeng.test`
- Teacher 1 owns classes 1–3 and students 001–060; each subsequent teacher owns the next three classes and next sixty students.
- Each class has twenty students. Names are fictional combinations, marked `Demo`; emails cannot route to a real public mailbox.

## Executed dataset (10 October 2026)

Before execution: all listed tables were empty except one existing academic period. That non-demo period was retained. First execution created:

| Entity | Created / demo total | Database total |
| --- | ---: | ---: |
| Users (8 teachers, 480 students, 1 admin) | 489 | 489 |
| Academic periods | 3 | 4 |
| Classes | 24 | 24 |
| Units | 24 | 24 |
| Tests | 72 | 72 |
| Sections | 72 | 72 |
| Questions | 720 | 720 |
| Choices | 1,600 | 1,600 |
| Variants | 144 | 144 |
| Test sessions | 72 | 72 |
| Class/period test assignments | 216 | 216 |
| Class/period test schedules | 216 | 216 |
| Vocabulary sets | 36 | 36 |
| Vocabulary cards | 540 | 540 |
| Class/period vocabulary assignments | 108 | 108 |
| Grammar topics | 24 | 24 |
| Grammar exercises | 96 | 96 |
| Grammar choices | 192 | 192 |
| Class/period grammar assignments | 72 | 72 |
| Test attempts | 3,840 | 3,840 |
| Answers | 38,304 | 38,304 |
| Vocabulary progress | 27,000 | 27,000 |
| Vocabulary activity attempts | 54,000 | 54,000 |
| Vocabulary sentence submissions | 1,800 | 1,800 |
| Grammar exercise attempts | 5,760 | 5,760 |
| Class announcements | 72 | 72 |

Of 3,840 test attempts, 3,824 are submitted and 16 remain in progress. There are **380 submitted ungraded essays** for provisional scores / pending grading queues. Four tests are unpublished drafts. Grades include released and unreleased schedules, manual publication, and automatic publication at close.

Machine-readable first-run evidence: `server/scripts/seed-demo-initial-report.json`. Latest rerun evidence: `server/scripts/seed-demo-report.json`. The second execution created **zero rows in every model**, with unchanged totals.

## Coverage and consistency

- Eight teacher-owned collections, three classes each, one permanent class per student, no cross-teacher assignments.
- Three separate periods (spring, summer, autumn 2026). All classes explicitly select autumn as their current period; content assignments are disjoint between periods. Teacher reports therefore show current-period results by default rather than the entire year's history.
- Nine tests per teacher: integrated unit, reading/headings, transcript-based listening, mock, vocabulary-check, and writing/speaking portfolio categories. Objective types include multiple-choice, true/false, short fill, and IELTS-style matching of paragraphs to headings. Mixed tests also contain an essay and a speaking prompt.
- Two deterministic variants per test, using the real `{ sections: [{ sectionId, questionIds }], choiceOrder }` layout. No cloned questions or altered answer keys.
- Test answers use the real `gradeAnswer`; stored percentages use `computeAttemptScore`. Objective correct/total counts exclude essay and speaking questions. Ungraded essays are excluded from the scored denominator and remain provisional; missing speaking recordings earn zero, exactly as in the application. No fabricated AI grades.
- Spring and summer submitted attempts fall within their historical schedules. Autumn has open, closed, and upcoming schedules around the fixed **2026-10-10** reference. Upcoming autumn tests and draft tests have no attempts. Historical sessions are closed; current self-practice sessions are active.
- Vocabulary: twelve coherent themes with fifteen real words each; thirty-six sets reuse these theme lists in three progressively labelled period tracks. Every card has an English definition and a context sentence. Sets are not thirty-six wholly distinct dictionaries. Progress covers learning, known, verified-known and genuinely unseen cards; exercise logs use fill-blank and self-check activity types.
- Grammar: twenty-four real topics, English HTML theory, worked example, and four exercises each (two choice, two fill). Review exercises deliberately reuse their topic's core example; they are not a full commercial question bank.
- Fixed dates and deterministic ability profiles produce reproducible varied scores and activity across the year without random or external AI requests.

## Honest limitations

**No audio assets are provided.** Listening assessments explicitly say transcript practice and expose a readable transcript. Speaking questions have usable prompts/preparation windows, but seeded answers contain no recording, transcript, invented audio, or fake AI feedback. Users can record real responses while testing. Audio and image URLs remain null; there are no broken external links. IPA and synonyms are not invented.

The reference date is deliberately fixed, not automatically rolled forward. As real time advances, open/upcoming windows become closed. Re-running is non-mutating, so it will not refresh schedules or overwrite a user's edited data. Use a new versioned fixture namespace for a future demo cycle, or change individual demo schedules through the normal UI.

The dataset emphasizes scale, relationships, score semantics, and common workflows. Reading passages, essays, and grammar examples are intentionally reused across teacher-isolated collections. It does not simulate live QR guests or call external grading services. No existing application settings are changed.

## Verification

Executed successfully:

```powershell
# from server
npx tsc --noEmit --strict --esModuleInterop --skipLibCheck --target ES2022 --module commonjs --moduleResolution node scripts/seed-demo.ts scripts/seed-demo-content.ts scripts/verify-demo.ts
npx tsx scripts/verify-demo.ts
# from root
npx eslint server/scripts/seed-demo.ts server/scripts/seed-demo-content.ts server/scripts/verify-demo.ts
```

The read-only verifier recomputed all submitted scores and objective answers; checked test/session/variant relationships, class assignments, schedule windows, all 144 layouts, and test/class ownership. Result: **0 errors** across all 3,840 attempts. Strict isolated TypeScript checking and scoped ESLint passed. Main-agent independent review / UI testing is separate from this database verification.
