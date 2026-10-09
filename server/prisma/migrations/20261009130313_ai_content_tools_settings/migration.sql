-- CreateEnum
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "aiToolsApiBaseUrl" TEXT,
ADD COLUMN     "aiToolsApiKeyEncrypted" TEXT,
ADD COLUMN     "aiToolsModel" TEXT,
ADD COLUMN     "examImportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "examImportSystemPrompt" TEXT,
ADD COLUMN     "grammarGenEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grammarGenSystemPrompt" TEXT,
ADD COLUMN     "teacherChatEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teacherChatSystemPrompt" TEXT,
ADD COLUMN     "teacherChatToolsSupported" BOOLEAN,
ADD COLUMN     "vocabGenEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vocabGenSystemPrompt" TEXT;
