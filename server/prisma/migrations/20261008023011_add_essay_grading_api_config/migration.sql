-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "essayGradingApiBaseUrl" TEXT,
ADD COLUMN     "essayGradingApiKeyEncrypted" TEXT,
ADD COLUMN     "essayGradingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "essayGradingModel" TEXT,
ADD COLUMN     "essayGradingSystemPrompt" TEXT;
