-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "contactId" TEXT;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
