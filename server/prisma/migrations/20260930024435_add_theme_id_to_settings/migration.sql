-- CreateEnum
CREATE TYPE "ThemeId" AS ENUM ('sunset', 'ocean', 'forest', 'violet', 'teal', 'rose', 'amber', 'indigo');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "themeId" "ThemeId" NOT NULL DEFAULT 'sunset';
