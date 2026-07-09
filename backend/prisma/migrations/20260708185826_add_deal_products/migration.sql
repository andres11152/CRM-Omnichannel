-- CreateTable
CREATE TABLE "deal_products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_products_companyId_idx" ON "deal_products"("companyId");

-- CreateIndex
CREATE INDEX "deal_products_dealId_idx" ON "deal_products"("dealId");

-- CreateIndex
CREATE INDEX "deal_products_productId_idx" ON "deal_products"("productId");

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
