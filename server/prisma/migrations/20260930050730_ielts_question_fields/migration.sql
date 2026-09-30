-- CreateEnum
CREATE TYPE "EssayTaskType" AS ENUM ('task1', 'task2');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'matching';

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "essayIeltsCoherenceScore" DOUBLE PRECISION,
ADD COLUMN     "essayIeltsGrammarScore" DOUBLE PRECISION,
ADD COLUMN     "essayIeltsLexicalScore" DOUBLE PRECISION,
ADD COLUMN     "essayIeltsTaskScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "essayMinWords" INTEGER,
ADD COLUMN     "essayTaskType" "EssayTaskType",
ADD COLUMN     "essayUseIeltsCriteria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fillBlankMaxWords" INTEGER,
ADD COLUMN     "preparationSeconds" INTEGER;
