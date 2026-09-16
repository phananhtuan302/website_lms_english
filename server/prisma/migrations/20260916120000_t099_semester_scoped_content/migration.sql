-- T-099: Semester-scoped content — every content-to-class assignment gains an
-- AcademicPeriod dimension.
--
-- This migration is hand-authored (not the raw `prisma migrate diff` output) because it
-- carries forward REAL, already-live data — the T-075 implicit m2m tables
-- (`_TestClasses`/`_FlashcardSetClasses`/`_GrammarTopicClasses`) and pre-existing
-- `test_class_schedules` rows — into the new 3-key shape before dropping/altering
-- anything, instead of a destructive drop-and-recreate. See `seed.ts`'s
-- `ensureEveryClassHasCurrentPeriod` doc comment for why the ONGOING, forever-idempotent
-- half of this migration lives in the seed script (BACKLOG.md T-099's stated
-- convention), while this ONE-TIME historical data carry lives here instead: this is the
-- one moment the old implicit join tables still physically exist to read from,
-- immediately before they are dropped by this same file — a Prisma migration is already
-- guaranteed to run at most once per database (tracked via `_prisma_migrations`), which is
-- exactly the idempotency guarantee this one-time step needs.

-- === 1. New explicit join tables (replacing T-075's implicit m2m) ====================

CREATE TABLE "test_class_period_assignments" (
    "testId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_class_period_assignments_pkey" PRIMARY KEY ("testId","classId","periodId")
);

CREATE TABLE "flashcard_set_class_period_assignments" (
    "flashcardSetId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_set_class_period_assignments_pkey" PRIMARY KEY ("flashcardSetId","classId","periodId")
);

CREATE TABLE "grammar_topic_class_period_assignments" (
    "grammarTopicId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_topic_class_period_assignments_pkey" PRIMARY KEY ("grammarTopicId","classId","periodId")
);

-- === 2. New/changed columns, added NULLABLE first so the data migration (section 4) has
-- something to backfill before either is tightened — real rows already exist in both
-- `classes` and `test_class_schedules`, so `prisma migrate diff`'s naive
-- straight-to-NOT-NULL output (verified against this exact database: it refuses to run,
-- "Added the required column `periodId` ... There are 3 rows in this table") cannot be
-- used as-is. ========================================================================

ALTER TABLE "classes" ADD COLUMN "currentPeriodId" TEXT;
ALTER TABLE "test_class_schedules" ADD COLUMN "periodId" TEXT;

-- === 3. One-time data migration ======================================================
-- Mirrors T-075's `migrateContentToDefaultClasses` idempotency spirit (check-before-
-- create, never double-assign) applied to AcademicPeriod instead of Class.
DO $$
DECLARE
  default_period_id TEXT;
BEGIN
  -- 3a. Resolve "the" period every currently-unset class should start on: the earliest
  -- existing AcademicPeriod by startDate system-wide, or a freshly created "Default
  -- Period" placeholder if none exist at all yet (mirrors T-075's "Default Class"
  -- create-if-missing convention, applied here to AcademicPeriod instead of Class).
  SELECT "id" INTO default_period_id FROM "academic_periods" ORDER BY "startDate" ASC LIMIT 1;

  IF default_period_id IS NULL THEN
    default_period_id := gen_random_uuid()::text;
    INSERT INTO "academic_periods" ("id", "name", "startDate", "endDate", "createdAt", "updatedAt")
    VALUES (
      default_period_id,
      'Default Period',
      TIMESTAMP '2000-01-01 00:00:00',
      TIMESTAMP '2100-01-01 00:00:00',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;

  -- 3b. Every Class without a currentPeriodId yet (i.e. every class that predates this
  -- migration) starts on that resolved period.
  UPDATE "classes" SET "currentPeriodId" = default_period_id WHERE "currentPeriodId" IS NULL;

  -- 3c. Carry forward every existing (test, class) / (flashcardSet, class) /
  -- (grammarTopic, class) assignment from T-075's old implicit m2m tables into the new
  -- 3-key tables, using that class's JUST-ASSIGNED currentPeriodId. "A" = classId,
  -- "B" = the content id (Prisma's implicit-m2m column convention: "A" references
  -- whichever model name sorts first alphabetically — "Class" sorts before
  -- "Test"/"FlashcardSet"/"GrammarTopic" in every one of these three pairs, confirmed
  -- against this exact database's own FK constraints from the T-075 migration,
  -- `20260915062540_t075_content_class_assignments/migration.sql`).
  INSERT INTO "test_class_period_assignments" ("testId", "classId", "periodId")
  SELECT tc."B", tc."A", c."currentPeriodId"
  FROM "_TestClasses" tc
  JOIN "classes" c ON c."id" = tc."A"
  ON CONFLICT DO NOTHING;

  INSERT INTO "flashcard_set_class_period_assignments" ("flashcardSetId", "classId", "periodId")
  SELECT fc."B", fc."A", c."currentPeriodId"
  FROM "_FlashcardSetClasses" fc
  JOIN "classes" c ON c."id" = fc."A"
  ON CONFLICT DO NOTHING;

  INSERT INTO "grammar_topic_class_period_assignments" ("grammarTopicId", "classId", "periodId")
  SELECT gc."B", gc."A", c."currentPeriodId"
  FROM "_GrammarTopicClasses" gc
  JOIN "classes" c ON c."id" = gc."A"
  ON CONFLICT DO NOTHING;

  -- 3d. Every existing TestClassSchedule row (T-092/T-093, predates the period
  -- dimension) gets that SAME class's currentPeriodId — "whichever period this class is
  -- on as of this migration" is the only meaningful answer for a schedule authored before
  -- periods existed as a scoping concept.
  UPDATE "test_class_schedules" tcs
  SET "periodId" = c."currentPeriodId"
  FROM "classes" c
  WHERE c."id" = tcs."classId" AND tcs."periodId" IS NULL;
END $$;

-- === 4. Now that every row has a periodId, tighten the column + fold it into the
-- primary key. ========================================================================

ALTER TABLE "test_class_schedules" ALTER COLUMN "periodId" SET NOT NULL;
ALTER TABLE "test_class_schedules" DROP CONSTRAINT "test_class_schedules_pkey";
ALTER TABLE "test_class_schedules" ADD CONSTRAINT "test_class_schedules_pkey" PRIMARY KEY ("testId", "classId", "periodId");

-- === 5. Drop the old T-075 implicit m2m join tables — their data was already copied
-- into the new 3-key tables in section 3c above. ======================================

ALTER TABLE "_TestClasses" DROP CONSTRAINT "_TestClasses_A_fkey";
ALTER TABLE "_TestClasses" DROP CONSTRAINT "_TestClasses_B_fkey";
DROP TABLE "_TestClasses";

ALTER TABLE "_FlashcardSetClasses" DROP CONSTRAINT "_FlashcardSetClasses_A_fkey";
ALTER TABLE "_FlashcardSetClasses" DROP CONSTRAINT "_FlashcardSetClasses_B_fkey";
DROP TABLE "_FlashcardSetClasses";

ALTER TABLE "_GrammarTopicClasses" DROP CONSTRAINT "_GrammarTopicClasses_A_fkey";
ALTER TABLE "_GrammarTopicClasses" DROP CONSTRAINT "_GrammarTopicClasses_B_fkey";
DROP TABLE "_GrammarTopicClasses";

-- === 6. Indexes for the new tables (mirrors the "index the reverse-lookup column"
-- convention Prisma applies automatically to an implicit m2m's second column) =========

CREATE INDEX "test_class_period_assignments_classId_periodId_idx" ON "test_class_period_assignments"("classId", "periodId");
CREATE INDEX "flashcard_set_class_period_assignments_classId_periodId_idx" ON "flashcard_set_class_period_assignments"("classId", "periodId");
CREATE INDEX "grammar_topic_class_period_assignments_classId_periodId_idx" ON "grammar_topic_class_period_assignments"("classId", "periodId");

-- === 7. Foreign keys =================================================================

ALTER TABLE "classes" ADD CONSTRAINT "classes_currentPeriodId_fkey" FOREIGN KEY ("currentPeriodId") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "test_class_period_assignments" ADD CONSTRAINT "test_class_period_assignments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_class_period_assignments" ADD CONSTRAINT "test_class_period_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_class_period_assignments" ADD CONSTRAINT "test_class_period_assignments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flashcard_set_class_period_assignments" ADD CONSTRAINT "flashcard_set_class_period_assignments_flashcardSetId_fkey" FOREIGN KEY ("flashcardSetId") REFERENCES "flashcard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flashcard_set_class_period_assignments" ADD CONSTRAINT "flashcard_set_class_period_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flashcard_set_class_period_assignments" ADD CONSTRAINT "flashcard_set_class_period_assignments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grammar_topic_class_period_assignments" ADD CONSTRAINT "grammar_topic_class_period_assignments_grammarTopicId_fkey" FOREIGN KEY ("grammarTopicId") REFERENCES "grammar_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grammar_topic_class_period_assignments" ADD CONSTRAINT "grammar_topic_class_period_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grammar_topic_class_period_assignments" ADD CONSTRAINT "grammar_topic_class_period_assignments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_class_schedules" ADD CONSTRAINT "test_class_schedules_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
