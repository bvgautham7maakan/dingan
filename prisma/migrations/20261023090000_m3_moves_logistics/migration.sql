-- AlterTable
ALTER TABLE "ApprovalFlow" ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN "clientId" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "WorkSegment" ADD COLUMN "moveId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DriverBill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountFils" INTEGER,
    "odometer" INTEGER,
    "photoId" TEXT NOT NULL,
    "voiceFileId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverBill_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverBill_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DriverBill" ("amountFils", "clientId", "createdAt", "date", "driverId", "id", "odometer", "photoId", "type", "vehicleId", "voiceFileId") SELECT "amountFils", "clientId", "createdAt", "date", "driverId", "id", "odometer", "photoId", "type", "vehicleId", "voiceFileId" FROM "DriverBill";
DROP TABLE "DriverBill";
ALTER TABLE "new_DriverBill" RENAME TO "DriverBill";
CREATE UNIQUE INDEX "DriverBill_clientId_key" ON "DriverBill"("clientId");
CREATE TABLE "new_ManpowerMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "fromSiteId" TEXT NOT NULL,
    "toSiteId" TEXT NOT NULL,
    "moveAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "voiceFileId" TEXT,
    "appliedAt" DATETIME,
    "tripId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManpowerMove_fromSiteId_fkey" FOREIGN KEY ("fromSiteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ManpowerMove_toSiteId_fkey" FOREIGN KEY ("toSiteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ManpowerMove_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ManpowerMove_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ManpowerMove" ("appliedAt", "clientId", "createdAt", "createdById", "fromSiteId", "id", "moveAt", "note", "reason", "status", "toSiteId", "tripId", "voiceFileId") SELECT "appliedAt", "clientId", "createdAt", "createdById", "fromSiteId", "id", "moveAt", "note", "reason", "status", "toSiteId", "tripId", "voiceFileId" FROM "ManpowerMove";
DROP TABLE "ManpowerMove";
ALTER TABLE "new_ManpowerMove" RENAME TO "ManpowerMove";
CREATE UNIQUE INDEX "ManpowerMove_clientId_key" ON "ManpowerMove"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_clientId_key" ON "FileObject"("clientId");

