ALTER TABLE "Shop"
  ADD COLUMN "defaultSurveyLocale" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "contactQuestionsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invite" ADD COLUMN "profileEmailHash" TEXT;
ALTER TABLE "Invite" ADD COLUMN "profilePhoneHash" TEXT;
ALTER TABLE "Invite" ADD COLUMN "placementId" TEXT;
CREATE INDEX "Invite_profileEmailHash_idx" ON "Invite"("profileEmailHash");
CREATE INDEX "Invite_profilePhoneHash_idx" ON "Invite"("profilePhoneHash");
CREATE INDEX "Invite_placementId_idx" ON "Invite"("placementId");
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Answer" ADD COLUMN "emailIdentityHash" TEXT;
ALTER TABLE "Answer" ADD COLUMN "phoneIdentityHash" TEXT;
CREATE INDEX "Answer_emailIdentityHash_idx" ON "Answer"("emailIdentityHash");
CREATE INDEX "Answer_phoneIdentityHash_idx" ON "Answer"("phoneIdentityHash");

ALTER TABLE "RewardIssue" ADD COLUMN "eligibilityKey" TEXT;
CREATE UNIQUE INDEX "RewardIssue_eligibilityKey_key" ON "RewardIssue"("eligibilityKey");

CREATE TABLE "PrivacyExport" (
  "id" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "customerHash" TEXT,
  "payloadEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacyExport_requestHash_key" ON "PrivacyExport"("requestHash");
CREATE INDEX "PrivacyExport_shopDomain_createdAt_idx" ON "PrivacyExport"("shopDomain", "createdAt");
CREATE INDEX "PrivacyExport_expiresAt_idx" ON "PrivacyExport"("expiresAt");
