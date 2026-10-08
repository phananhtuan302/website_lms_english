-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "speakingGradingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "speakingGradingSystemPrompt" TEXT;
