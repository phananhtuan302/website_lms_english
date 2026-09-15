-- AlterEnum
ALTER TYPE "VocabActivityType" ADD VALUE 'selfCheck';

-- AlterTable
ALTER TABLE "flashcard_progress" ADD COLUMN     "verifiedKnown" BOOLEAN NOT NULL DEFAULT false;
