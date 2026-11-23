-- AlterTable
ALTER TABLE "NavEvent" ADD COLUMN     "trigger" TEXT,
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'real',
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "detail" JSONB;

-- Rows that exist when this migration is applied predate the extension:
-- mark them as pilot data on the first schema version.
UPDATE "NavEvent" SET "origin" = 'pilot', "schemaVersion" = 1;
