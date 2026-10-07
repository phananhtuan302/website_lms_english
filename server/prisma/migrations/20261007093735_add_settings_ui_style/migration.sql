-- CreateEnum
CREATE TYPE "UiStyleId" AS ENUM ('glass', 'brutalist', 'vivid', 'dark');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "uiStyle" "UiStyleId" NOT NULL DEFAULT 'glass';
