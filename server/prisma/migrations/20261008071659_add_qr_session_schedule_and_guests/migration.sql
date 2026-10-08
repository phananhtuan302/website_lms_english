-- AlterTable
ALTER TABLE "test_sessions" ADD COLUMN     "allowGuests" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;
