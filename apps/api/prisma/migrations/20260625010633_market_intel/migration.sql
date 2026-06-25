-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('competitor', 'keyword');

-- CreateEnum
CREATE TYPE "BriefCategory" AS ENUM ('product_launch', 'investment_ma', 'partnership', 'pricing', 'regulation', 'tech', 'other');

-- CreateTable
CREATE TABLE "MonitorTarget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TargetType" NOT NULL,
    "name" TEXT NOT NULL,
    "rssUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dedupHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "publishedAt" TIMESTAMP(3),
    "summaryRaw" TEXT,
    "matchedTargets" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'done',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingItem" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "feedItemId" TEXT NOT NULL,
    "category" "BriefCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "implication" TEXT NOT NULL,
    "matchedTargets" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BriefingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorTarget_tenantId_active_idx" ON "MonitorTarget"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorTarget_tenantId_type_name_key" ON "MonitorTarget"("tenantId", "type", "name");

-- CreateIndex
CREATE INDEX "FeedItem_tenantId_firstSeenAt_idx" ON "FeedItem"("tenantId", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedItem_tenantId_dedupHash_key" ON "FeedItem"("tenantId", "dedupHash");

-- CreateIndex
CREATE INDEX "Briefing_tenantId_createdAt_idx" ON "Briefing"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BriefingItem_briefingId_idx" ON "BriefingItem"("briefingId");

-- AddForeignKey
ALTER TABLE "BriefingItem" ADD CONSTRAINT "BriefingItem_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingItem" ADD CONSTRAINT "BriefingItem_feedItemId_fkey" FOREIGN KEY ("feedItemId") REFERENCES "FeedItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
