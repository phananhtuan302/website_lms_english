-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'speaking';

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "speakingAiFeedback" TEXT,
ADD COLUMN     "speakingAiScore" DOUBLE PRECISION,
ADD COLUMN     "speakingAudioData" TEXT,
ADD COLUMN     "speakingSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "speakingTranscript" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "allowedResponseSeconds" INTEGER,
ADD COLUMN     "promptAudioUrl" TEXT;
