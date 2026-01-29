-- CreateEnum
CREATE TYPE "TicketResolutionType" AS ENUM ('SALE', 'SUPPORT', 'ADMIN', 'OTHER', 'SPAM');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('Physical', 'Service', 'Digital');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'SPAM');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultSenderEmail" TEXT,
ADD COLUMN     "defaultSenderName" TEXT,
ADD COLUMN     "emailProvider" TEXT NOT NULL DEFAULT 'SMTP',
ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smtpUser" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "maxCompanies" INTEGER,
ADD COLUMN     "maxContacts" INTEGER,
ADD COLUMN     "maxWorkflows" INTEGER,
ADD COLUMN     "storageLimitGb" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "resolutionNotes" TEXT,
ADD COLUMN     "resolutionType" "TicketResolutionType";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "resetPasswordExpires" TIMESTAMP(3),
ADD COLUMN     "resetPasswordToken" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'Physical',
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messageId" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "type" "EmailType" NOT NULL,
    "contactId" TEXT,
    "ticketId" TEXT,
    "attachments" JSONB,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_companyId_status_idx" ON "products"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "emails_messageId_key" ON "emails"("messageId");

-- CreateIndex
CREATE INDEX "emails_companyId_createdAt_idx" ON "emails"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "emails_contactId_createdAt_idx" ON "emails"("contactId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "emails_ticketId_createdAt_idx" ON "emails"("ticketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "emails_status_idx" ON "emails"("status");

-- CreateIndex
CREATE INDEX "emails_messageId_idx" ON "emails"("messageId");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "push_subscriptions_companyId_idx" ON "push_subscriptions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_userId_endpoint_key" ON "push_subscriptions"("userId", "endpoint");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
