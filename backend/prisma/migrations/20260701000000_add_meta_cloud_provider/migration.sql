-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('BAILEYS', 'META');

-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN     "metaAccessToken" TEXT,
ADD COLUMN     "metaBusinessId" TEXT,
ADD COLUMN     "metaPhoneNumberId" TEXT,
ADD COLUMN     "metaVerifyToken" TEXT,
ADD COLUMN     "provider" "WhatsAppProvider" NOT NULL DEFAULT 'BAILEYS';
