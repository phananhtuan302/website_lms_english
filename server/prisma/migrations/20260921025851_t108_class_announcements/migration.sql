-- CreateTable
CREATE TABLE "class_announcements" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_announcements_classId_pinned_createdAt_idx" ON "class_announcements"("classId", "pinned", "createdAt");

-- AddForeignKey
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
