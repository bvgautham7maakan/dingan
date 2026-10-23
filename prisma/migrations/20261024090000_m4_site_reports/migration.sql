-- AlterTable
ALTER TABLE "Duty" ADD COLUMN "doneNote" TEXT;

-- AlterTable
ALTER TABLE "SiteQuery" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "SiteQuery" ADD COLUMN "discipline" TEXT;
ALTER TABLE "SiteQuery" ADD COLUMN "drawingRef" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SafetyChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "issues" INTEGER NOT NULL DEFAULT 0,
    "photoId" TEXT,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafetyChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SafetyChecklist_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SafetyChecklist" ("byId", "clientId", "createdAt", "date", "id", "items", "photoId", "projectId") SELECT "byId", "clientId", "createdAt", "date", "id", "items", "photoId", "projectId" FROM "SafetyChecklist";
DROP TABLE "SafetyChecklist";
ALTER TABLE "new_SafetyChecklist" RENAME TO "SafetyChecklist";
CREATE UNIQUE INDEX "SafetyChecklist_clientId_key" ON "SafetyChecklist"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

