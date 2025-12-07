-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_credentials" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_credentials_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_credentials_sessionId_key_key" ON "whatsapp_credentials"("sessionId", "key");