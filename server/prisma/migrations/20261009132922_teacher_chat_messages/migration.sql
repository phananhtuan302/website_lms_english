-- CreateTable
CREATE TABLE "teacher_chat_messages" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_chat_messages_teacherId_createdAt_idx" ON "teacher_chat_messages"("teacherId", "createdAt");

-- AddForeignKey
ALTER TABLE "teacher_chat_messages" ADD CONSTRAINT "teacher_chat_messages_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
