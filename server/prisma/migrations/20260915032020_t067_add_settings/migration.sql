-- CreateEnum
CREATE TYPE "SiteLanguage" AS ENUM ('en', 'vi');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'admin';

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "language" "SiteLanguage" NOT NULL DEFAULT 'en',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);
