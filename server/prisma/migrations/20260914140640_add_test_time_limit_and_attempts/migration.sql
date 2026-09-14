-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('inProgress', 'submitted');

-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "timeLimitMinutes" INTEGER;

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'inProgress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "correctCount" INTEGER,
    "totalCount" INTEGER,
    "scorePercent" DOUBLE PRECISION,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedChoiceId" TEXT,
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attempts_sessionId_studentId_key" ON "attempts"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attemptId_questionId_key" ON "answers"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "test_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_selectedChoiceId_fkey" FOREIGN KEY ("selectedChoiceId") REFERENCES "choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
