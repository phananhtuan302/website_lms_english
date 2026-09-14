-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('live', 'selfPractice');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'essay';

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "manualComment" TEXT,
ADD COLUMN     "manualScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "tabSwitchCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tabSwitchLog" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "essayMaxScore" INTEGER;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "maxPlayCount" INTEGER,
ADD COLUMN     "passageImageUrl" TEXT,
ADD COLUMN     "passageText" TEXT;

-- AlterTable
ALTER TABLE "test_sessions" ADD COLUMN     "mode" "SessionMode" NOT NULL DEFAULT 'live';
