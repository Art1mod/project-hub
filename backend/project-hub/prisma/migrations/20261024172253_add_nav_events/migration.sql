-- CreateTable
CREATE TABLE "NavEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userHash" TEXT NOT NULL,
    "tenantHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'control',
    "type" TEXT NOT NULL,
    "fromRoute" TEXT,
    "toRoute" TEXT,
    "entityType" TEXT,
    "entityHash" TEXT,
    "dwellMs" INTEGER,
    "latencyMs" INTEGER,
    "clientTs" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NavEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NavEvent_sessionId_clientTs_idx" ON "NavEvent"("sessionId", "clientTs");

-- CreateIndex
CREATE INDEX "NavEvent_tenantHash_createdAt_idx" ON "NavEvent"("tenantHash", "createdAt");
