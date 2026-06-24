-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FINANCE_STAFF', 'FINANCE_APPROVER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TemplateKey" AS ENUM ('BANK_ACCOUNT_MASTER', 'BANK_TRANSACTION', 'CASHFLOW_SCHEDULE', 'TRIAL_BALANCE', 'JOURNAL_ENTRY', 'SUBLEDGER_AR', 'SUBLEDGER_AP', 'FIXED_ASSET', 'COMPARATIVE_FS');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('RECEIVED', 'PARSED', 'MAPPED', 'VALIDATED', 'BLOCKED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "StatementType" AS ENUM ('BS', 'IS');

-- CreateEnum
CREATE TYPE "CashflowDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "DrCr" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "SliceType" AS ENUM ('cash', 'closing');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('FATAL', 'WARN', 'INFO');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'CALCULATED', 'BLOCKED', 'AI_DRAFTING', 'DRAFT', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FINANCE_STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "templateKey" "TemplateKey" NOT NULL,
    "domain" "SliceType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "period" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'RECEIVED',
    "lifecycle" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "rowCount" INTEGER,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColumnMapping" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceHeader" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "confirmedBy" TEXT,

    CONSTRAINT "ColumnMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawDataset" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheetName" TEXT,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "cellErrors" JSONB,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RawRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stdCode" TEXT,
    "statement" "StatementType",
    "fsLineItem" TEXT,
    "normalSide" TEXT,
    "isControl" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNoNorm" TEXT NOT NULL,
    "purpose" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "openingBalance" DECIMAL(18,0) NOT NULL,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "overdraftLimit" DECIMAL(18,0),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "depositAmt" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "withdrawalAmt" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(18,0),
    "counterparty" TEXT,
    "txnType" TEXT,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "direction" "CashflowDirection" NOT NULL,
    "itemType" TEXT NOT NULL,
    "counterparty" TEXT,
    "amount" DECIMAL(18,0) NOT NULL,
    "certainty" TEXT,
    "accountAlias" TEXT,
    "refNo" TEXT,

    CONSTRAINT "CashflowSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,0),
    "debitTotal" DECIMAL(18,0) NOT NULL,
    "creditTotal" DECIMAL(18,0) NOT NULL,
    "closingBalance" DECIMAL(18,0),

    CONSTRAINT "TrialBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "lineNo" INTEGER,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "drcr" "DrCr" NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT,
    "amount" DECIMAL(18,0) NOT NULL,
    "description" TEXT,
    "counterparty" TEXT,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "arap" TEXT NOT NULL,
    "partnerCode" TEXT,
    "partnerName" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,0),
    "increase" DECIMAL(18,0),
    "decrease" DECIMAL(18,0),
    "closingBalance" DECIMAL(18,0) NOT NULL,

    CONSTRAINT "Subledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" DECIMAL(18,0) NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "accumDepOpening" DECIMAL(18,0) NOT NULL,
    "monthlyDepreciation" DECIMAL(18,0),

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparativeFs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "priorPeriod" TEXT NOT NULL,
    "statement" "StatementType" NOT NULL,
    "lineItem" TEXT NOT NULL,
    "currentAmt" DECIMAL(18,0),
    "priorAmt" DECIMAL(18,0) NOT NULL,

    CONSTRAINT "ComparativeFs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "slice" "SliceType" NOT NULL,
    "period" TEXT,
    "engineVersion" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "cro" JSONB NOT NULL,
    "blockedAI" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "fatalCount" INTEGER NOT NULL DEFAULT 0,
    "warnCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0,
    "blockedAI" BOOLEAN NOT NULL DEFAULT false,
    "findings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "croId" TEXT,
    "slice" "SliceType" NOT NULL,
    "period" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'AI_DRAFTING',
    "title" TEXT NOT NULL,
    "content" JSONB,
    "guard" JSONB,
    "confidence" DOUBLE PRECISION,
    "regenCount" INTEGER NOT NULL DEFAULT 0,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "findingId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "croHash" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "UploadBatch_tenantId_templateKey_period_idx" ON "UploadBatch"("tenantId", "templateKey", "period");

-- CreateIndex
CREATE INDEX "UploadBatch_tenantId_status_idx" ON "UploadBatch"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UploadBatch_tenantId_sourceHash_key" ON "UploadBatch"("tenantId", "sourceHash");

-- CreateIndex
CREATE INDEX "ColumnMapping_batchId_idx" ON "ColumnMapping"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "RawDataset_batchId_key" ON "RawDataset"("batchId");

-- CreateIndex
CREATE INDEX "RawRow_datasetId_rowIndex_idx" ON "RawRow"("datasetId", "rowIndex");

-- CreateIndex
CREATE INDEX "Account_tenantId_stdCode_idx" ON "Account"("tenantId", "stdCode");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenantId_code_key" ON "Account"("tenantId", "code");

-- CreateIndex
CREATE INDEX "BankAccount_tenantId_accountNoNorm_idx" ON "BankAccount"("tenantId", "accountNoNorm");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_tenantId_alias_key" ON "BankAccount"("tenantId", "alias");

-- CreateIndex
CREATE INDEX "BankTransaction_tenantId_bankAccountId_txnDate_idx" ON "BankTransaction"("tenantId", "bankAccountId", "txnDate");

-- CreateIndex
CREATE INDEX "BankTransaction_batchId_idx" ON "BankTransaction"("batchId");

-- CreateIndex
CREATE INDEX "CashflowSchedule_tenantId_scheduledDate_idx" ON "CashflowSchedule"("tenantId", "scheduledDate");

-- CreateIndex
CREATE INDEX "CashflowSchedule_batchId_idx" ON "CashflowSchedule"("batchId");

-- CreateIndex
CREATE INDEX "TrialBalance_tenantId_period_idx" ON "TrialBalance"("tenantId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TrialBalance_tenantId_period_accountCode_key" ON "TrialBalance"("tenantId", "period", "accountCode");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_period_voucherNo_idx" ON "JournalEntry"("tenantId", "period", "voucherNo");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_accountCode_entryDate_idx" ON "JournalEntry"("tenantId", "accountCode", "entryDate");

-- CreateIndex
CREATE INDEX "Subledger_tenantId_period_arap_idx" ON "Subledger"("tenantId", "period", "arap");

-- CreateIndex
CREATE INDEX "Subledger_batchId_idx" ON "Subledger"("batchId");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_period_idx" ON "FixedAsset"("tenantId", "period");

-- CreateIndex
CREATE INDEX "FixedAsset_batchId_idx" ON "FixedAsset"("batchId");

-- CreateIndex
CREATE INDEX "ComparativeFs_tenantId_period_idx" ON "ComparativeFs"("tenantId", "period");

-- CreateIndex
CREATE INDEX "ComparativeFs_batchId_idx" ON "ComparativeFs"("batchId");

-- CreateIndex
CREATE INDEX "CalculationResult_tenantId_slice_period_idx" ON "CalculationResult"("tenantId", "slice", "period");

-- CreateIndex
CREATE INDEX "CalculationResult_batchId_idx" ON "CalculationResult"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationReport_batchId_key" ON "ValidationReport"("batchId");

-- CreateIndex
CREATE INDEX "ValidationReport_tenantId_idx" ON "ValidationReport"("tenantId");

-- CreateIndex
CREATE INDEX "Report_tenantId_slice_period_status_idx" ON "Report"("tenantId", "slice", "period", "status");

-- CreateIndex
CREATE INDEX "Report_batchId_idx" ON "Report"("batchId");

-- CreateIndex
CREATE INDEX "Comment_reportId_idx" ON "Comment"("reportId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_targetType_targetId_idx" ON "AuditLog"("tenantId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog"("tenantId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColumnMapping" ADD CONSTRAINT "ColumnMapping_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDataset" ADD CONSTRAINT "RawDataset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRow" ADD CONSTRAINT "RawRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "RawDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationResult" ADD CONSTRAINT "CalculationResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationReport" ADD CONSTRAINT "ValidationReport_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_croId_fkey" FOREIGN KEY ("croId") REFERENCES "CalculationResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
