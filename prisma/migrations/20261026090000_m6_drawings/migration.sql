-- AlterTable
ALTER TABLE "Drawing" ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "DrawingMeasurement" ADD COLUMN "clientId" TEXT;

-- AlterTable
ALTER TABLE "DrawingRevision" ADD COLUMN "notes" TEXT;
ALTER TABLE "DrawingRevision" ADD COLUMN "pageCount" INTEGER;
ALTER TABLE "DrawingRevision" ADD COLUMN "uploadedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DrawingMeasurement_clientId_key" ON "DrawingMeasurement"("clientId");

