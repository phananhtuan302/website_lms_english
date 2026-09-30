-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "essayAiCoherenceScore" DOUBLE PRECISION,
ADD COLUMN     "essayAiFeedback" TEXT,
ADD COLUMN     "essayAiGrammarScore" DOUBLE PRECISION,
ADD COLUMN     "essayAiLexicalScore" DOUBLE PRECISION,
ADD COLUMN     "essayAiScore" DOUBLE PRECISION,
ADD COLUMN     "essayAiTaskScore" DOUBLE PRECISION;
