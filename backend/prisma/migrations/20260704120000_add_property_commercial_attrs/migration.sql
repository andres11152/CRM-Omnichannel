-- CreateEnum
CREATE TYPE "PropertyPowerType" AS ENUM ('MONOFASICA', 'BIFASICA', 'TRIFASICA');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "ceilingHeight" DOUBLE PRECISION,
ADD COLUMN     "depth" DOUBLE PRECISION,
ADD COLUMN     "frontage" DOUBLE PRECISION,
ADD COLUMN     "hasLoadingDock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasMezzanine" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasShowcase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCornerLot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permittedUse" TEXT,
ADD COLUMN     "powerType" "PropertyPowerType";
