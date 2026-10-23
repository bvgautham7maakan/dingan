-- AlterTable
ALTER TABLE "HighAlert" ADD COLUMN "resolution" TEXT;

-- AlterTable
ALTER TABLE "MaterialRequest" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "MaterialRequestLine" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "MaterialSubmittal" ADD COLUMN "remarks" TEXT;
ALTER TABLE "MaterialSubmittal" ADD COLUMN "supplier" TEXT;

