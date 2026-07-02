-- CreateEnum
CREATE TYPE "PropertyOperation" AS ENUM ('VENTA', 'ARRIENDO', 'ARRIENDO_VENTA', 'PERMUTA');

-- CreateEnum
CREATE TYPE "PropertyKind" AS ENUM ('APARTAMENTO', 'CASA', 'APARTAESTUDIO', 'CASA_CAMPESTRE', 'LOCAL_COMERCIAL', 'OFICINA', 'BODEGA', 'CONSULTORIO', 'LOTE', 'FINCA', 'PARQUEADERO', 'HABITACION', 'EDIFICIO', 'OTRO');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('DISPONIBLE', 'RESERVADO', 'ARRENDADO', 'VENDIDO', 'SUSPENDIDO', 'BORRADOR');

-- CreateEnum
CREATE TYPE "PropertyCondition" AS ENUM ('NUEVO', 'USADO', 'SOBRE_PLANOS', 'EN_CONSTRUCCION', 'REMODELADO');

-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'PROPERTIES';

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "operation" "PropertyOperation" NOT NULL,
    "kind" "PropertyKind" NOT NULL,
    "status" "PropertyStatus" NOT NULL DEFAULT 'BORRADOR',
    "condition" "PropertyCondition",
    "title" TEXT NOT NULL,
    "description" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "adminFee" DOUBLE PRECISION,
    "priceIncludesAdmin" BOOLEAN NOT NULL DEFAULT false,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "pricePerM2" DOUBLE PRECISION,
    "builtArea" DOUBLE PRECISION,
    "privateArea" DOUBLE PRECISION,
    "lotArea" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "parkingSpots" INTEGER,
    "floor" INTEGER,
    "totalFloors" INTEGER,
    "yearBuilt" INTEGER,
    "stratum" INTEGER,
    "country" TEXT NOT NULL DEFAULT 'Colombia',
    "department" TEXT,
    "city" TEXT,
    "neighborhood" TEXT,
    "address" TEXT,
    "addressVisible" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "zipCode" TEXT,
    "registryNumber" TEXT,
    "cadastralNumber" TEXT,
    "isExclusive" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3),
    "commissionPct" DOUBLE PRECISION,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "virtualTourUrl" TEXT,
    "ownerContactId" TEXT,
    "ownerAccountId" TEXT,
    "assignedToId" TEXT,
    "dealId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_images" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_companyId_status_idx" ON "properties"("companyId", "status");

-- CreateIndex
CREATE INDEX "properties_companyId_operation_kind_idx" ON "properties"("companyId", "operation", "kind");

-- CreateIndex
CREATE INDEX "properties_companyId_city_neighborhood_idx" ON "properties"("companyId", "city", "neighborhood");

-- CreateIndex
CREATE INDEX "properties_companyId_deletedAt_idx" ON "properties"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "properties_publicId_idx" ON "properties"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "properties_companyId_slug_key" ON "properties"("companyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "properties_companyId_reference_key" ON "properties"("companyId", "reference");

-- CreateIndex
CREATE INDEX "property_images_propertyId_order_idx" ON "property_images"("propertyId", "order");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

