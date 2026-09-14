-- CreateEnum
CREATE TYPE "VocabActivityType" AS ENUM ('fillBlank', 'unscramble', 'listenAndType', 'ipaToWord', 'matching', 'sentence', 'spaceShooter', 'runner');

-- CreateTable
CREATE TABLE "flashcard_exercise_attempts" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "VocabActivityType" NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_exercise_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flashcard_exercise_attempts_studentId_type_idx" ON "flashcard_exercise_attempts"("studentId", "type");

-- CreateIndex
CREATE INDEX "flashcard_exercise_attempts_cardId_idx" ON "flashcard_exercise_attempts"("cardId");

-- CreateIndex
CREATE INDEX "flashcard_exercise_attempts_createdAt_idx" ON "flashcard_exercise_attempts"("createdAt");

-- AddForeignKey
ALTER TABLE "flashcard_exercise_attempts" ADD CONSTRAINT "flashcard_exercise_attempts_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcard_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_exercise_attempts" ADD CONSTRAINT "flashcard_exercise_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
