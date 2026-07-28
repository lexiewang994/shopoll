-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SurveyKind" AS ENUM ('PURCHASE_MOTIVATION', 'ATTRIBUTION', 'PURCHASE_BARRIER', 'ABANDONMENT', 'NPS', 'CSAT', 'PRODUCT_FEEDBACK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Surface" AS ENUM ('THANK_YOU', 'ORDER_STATUS', 'THEME_INLINE', 'THEME_POPUP', 'STANDALONE', 'KLAVIYO_EMAIL', 'KLAVIYO_SMS');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('VIEWED', 'STARTED', 'PARTIAL', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED', 'REDEEMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DISCARDED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "adminLocale" TEXT NOT NULL DEFAULT 'zh-CN',
    "retentionDays" INTEGER NOT NULL DEFAULT 730,
    "sensitiveRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "SurveyKind" NOT NULL,
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabledLocales" TEXT[] DEFAULT ARRAY['en', 'de', 'es']::TEXT[],
    "draftDefinition" JSONB NOT NULL,
    "activeVersionId" TEXT,
    "createdByHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyVersion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "surface" "Surface" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "triggerConfig" JSONB NOT NULL,
    "styleConfig" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sampleRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "frequencyCapDays" INTEGER NOT NULL DEFAULT 14,
    "maxResponses" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceRule" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "groupIndex" INTEGER NOT NULL DEFAULT 0,
    "groupJoin" TEXT NOT NULL DEFAULT 'OR',
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AudienceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "surveyVersionId" TEXT NOT NULL,
    "surface" "Surface" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "orderGidHash" TEXT,
    "orderGidEncrypted" TEXT,
    "klaviyoProfileId" TEXT,
    "productFacts" JSONB,
    "context" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseSession" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "surveyVersionId" TEXT NOT NULL,
    "placementId" TEXT,
    "inviteId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "surface" "Surface" NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'VIEWED',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "visitorHash" TEXT,
    "orderGidHash" TEXT,
    "orderGidEncrypted" TEXT,
    "targetProductGid" TEXT,
    "productFacts" JSONB,
    "context" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "responseSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionSnapshot" JSONB NOT NULL,
    "value" JSONB,
    "encryptedValue" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impression" (
    "id" TEXT NOT NULL,
    "surveyVersionId" TEXT NOT NULL,
    "placementId" TEXT,
    "responseSessionId" TEXT,
    "visitorHash" TEXT,
    "surface" "Surface" NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Impression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFact" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "orderGidHash" TEXT NOT NULL,
    "orderGidEncrypted" TEXT NOT NULL,
    "orderCreatedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "market" TEXT,
    "locale" TEXT,
    "customerOrderIndex" INTEGER,
    "isFirstOrder" BOOLEAN,
    "productFacts" JSONB NOT NULL,
    "utm" JSONB,
    "source" TEXT,
    "discountCodes" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "productGid" TEXT,
    "handle" TEXT,
    "title" TEXT NOT NULL,
    "isCore" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardIssue" (
    "id" TEXT NOT NULL,
    "responseSessionId" TEXT NOT NULL,
    "type" "RewardType" NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "codeEncrypted" TEXT,
    "codeLast4" TEXT,
    "shopifyDiscountGid" TEXT,
    "configSnapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSubscription" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "recipientEncrypted" TEXT NOT NULL,
    "klaviyoProfileId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "weekday" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 9,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixelEvent" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PixelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "actorHash" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "surveyId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_activeVersionId_key" ON "Survey"("activeVersionId");

-- CreateIndex
CREATE INDEX "Survey_shopDomain_status_idx" ON "Survey"("shopDomain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_shopDomain_slug_key" ON "Survey"("shopDomain", "slug");

-- CreateIndex
CREATE INDEX "SurveyVersion_surveyId_publishedAt_idx" ON "SurveyVersion"("surveyId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyVersion_surveyId_version_key" ON "SurveyVersion"("surveyId", "version");

-- CreateIndex
CREATE INDEX "Placement_surface_enabled_priority_idx" ON "Placement"("surface", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_surveyId_surface_key" ON "Placement"("surveyId", "surface");

-- CreateIndex
CREATE INDEX "AudienceRule_placementId_groupIndex_sortOrder_idx" ON "AudienceRule"("placementId", "groupIndex", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_idempotencyKey_key" ON "Invite"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Invite_orderGidHash_idx" ON "Invite"("orderGidHash");

-- CreateIndex
CREATE INDEX "Invite_expiresAt_idx" ON "Invite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseSession_inviteId_key" ON "ResponseSession"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseSession_tokenHash_key" ON "ResponseSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseSession_dedupeKey_key" ON "ResponseSession"("dedupeKey");

-- CreateIndex
CREATE INDEX "ResponseSession_shopDomain_createdAt_idx" ON "ResponseSession"("shopDomain", "createdAt");

-- CreateIndex
CREATE INDEX "ResponseSession_surveyVersionId_status_createdAt_idx" ON "ResponseSession"("surveyVersionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ResponseSession_orderGidHash_idx" ON "ResponseSession"("orderGidHash");

-- CreateIndex
CREATE INDEX "ResponseSession_visitorHash_idx" ON "ResponseSession"("visitorHash");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_idempotencyKey_key" ON "Answer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Answer_questionId_answeredAt_idx" ON "Answer"("questionId", "answeredAt");

-- CreateIndex
CREATE INDEX "Answer_isSensitive_answeredAt_idx" ON "Answer"("isSensitive", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_responseSessionId_questionId_key" ON "Answer"("responseSessionId", "questionId");

-- CreateIndex
CREATE INDEX "Impression_surveyVersionId_createdAt_idx" ON "Impression"("surveyVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "Impression_placementId_createdAt_idx" ON "Impression"("placementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFact_orderGidHash_key" ON "OrderFact"("orderGidHash");

-- CreateIndex
CREATE INDEX "OrderFact_shopDomain_orderCreatedAt_idx" ON "OrderFact"("shopDomain", "orderCreatedAt");

-- CreateIndex
CREATE INDEX "OrderFact_source_orderCreatedAt_idx" ON "OrderFact"("source", "orderCreatedAt");

-- CreateIndex
CREATE INDEX "ProductMapping_shopDomain_productGid_idx" ON "ProductMapping"("shopDomain", "productGid");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_shopDomain_productKey_key" ON "ProductMapping"("shopDomain", "productKey");

-- CreateIndex
CREATE UNIQUE INDEX "RewardIssue_responseSessionId_key" ON "RewardIssue"("responseSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_shopDomain_provider_key" ON "IntegrationConfig"("shopDomain", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_idempotencyKey_key" ON "IntegrationEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IntegrationEvent_status_nextAttemptAt_idx" ON "IntegrationEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_shopDomain_provider_createdAt_idx" ON "IntegrationEvent"("shopDomain", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "ReportSubscription_shopDomain_enabled_idx" ON "ReportSubscription"("shopDomain", "enabled");

-- CreateIndex
CREATE INDEX "PixelEvent_shopDomain_visitorHash_occurredAt_idx" ON "PixelEvent"("shopDomain", "visitorHash", "occurredAt");

-- CreateIndex
CREATE INDEX "PixelEvent_expiresAt_idx" ON "PixelEvent"("expiresAt");

-- CreateIndex
CREATE INDEX "WebhookReceipt_processedAt_idx" ON "WebhookReceipt"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_topic_externalId_key" ON "WebhookReceipt"("provider", "topic", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_shopDomain_createdAt_idx" ON "AuditLog"("shopDomain", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "SurveyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyVersion" ADD CONSTRAINT "SurveyVersion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceRule" ADD CONSTRAINT "AudienceRule_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_surveyVersionId_fkey" FOREIGN KEY ("surveyVersionId") REFERENCES "SurveyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseSession" ADD CONSTRAINT "ResponseSession_surveyVersionId_fkey" FOREIGN KEY ("surveyVersionId") REFERENCES "SurveyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseSession" ADD CONSTRAINT "ResponseSession_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseSession" ADD CONSTRAINT "ResponseSession_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "Invite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_responseSessionId_fkey" FOREIGN KEY ("responseSessionId") REFERENCES "ResponseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_surveyVersionId_fkey" FOREIGN KEY ("surveyVersionId") REFERENCES "SurveyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_responseSessionId_fkey" FOREIGN KEY ("responseSessionId") REFERENCES "ResponseSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMapping" ADD CONSTRAINT "ProductMapping_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardIssue" ADD CONSTRAINT "RewardIssue_responseSessionId_fkey" FOREIGN KEY ("responseSessionId") REFERENCES "ResponseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSubscription" ADD CONSTRAINT "ReportSubscription_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
