import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { ensureShop } from "../services/admin-surveys.server";
import { decryptText, encryptText, hashIdentifier } from "../services/security.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const shop = await ensureShop(shopDomain);
  const reports = await db.reportSubscription.findMany({
    where: { shopDomain },
    select: {
      id: true,
      locale: true,
      timezone: true,
      weekday: true,
      hour: true,
      enabled: true,
      klaviyoProfileId: true,
      recipientEncrypted: true,
    },
  });
  return Response.json({
    shop: {
      domain: shop.domain,
      adminLocale: shop.adminLocale,
      defaultSurveyLocale: shop.defaultSurveyLocale,
      contactQuestionsEnabled: shop.contactQuestionsEnabled,
      timezone: shop.timezone,
      retentionDays: shop.retentionDays,
      sensitiveRetentionDays: shop.sensitiveRetentionDays,
    },
    reports: reports.map(({ recipientEncrypted, ...report }) => {
      let email = "";
      try {
        email = decryptText(
          recipientEncrypted,
          `shopoll-report-recipient:${shopDomain}`,
        );
      } catch {
        // A missing/rotated key is surfaced as an empty recipient, never as ciphertext.
      }
      return { ...report, email };
    }),
    integrations: {
      klaviyo: Boolean(process.env.KLAVIYO_PRIVATE_API_KEY),
      klaviyoFlow: Boolean(
        process.env.KLAVIYO_FLOW_SECRET && process.env.KLAVIYO_ALLOWED_FLOW_IDS,
      ),
      encryption: Boolean(process.env.SHOPOLL_ENCRYPTION_KEY),
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const body = (await request.json()) as {
    adminLocale?: string;
    defaultSurveyLocale?: string;
    contactQuestionsEnabled?: boolean;
    timezone?: string;
    retentionDays?: number;
    sensitiveRetentionDays?: number;
    report?: {
      email?: string;
      emails?: string[];
      klaviyoProfileId?: string;
      locale?: string;
      timezone?: string;
      weekday?: number;
      hour?: number;
      enabled?: boolean;
    };
  };
  const retentionDays = Math.max(30, Math.min(3650, Math.trunc(body.retentionDays ?? 730)));
  const sensitiveRetentionDays = Math.max(
    7,
    Math.min(365, Math.trunc(body.sensitiveRetentionDays ?? 90)),
  );
  const shop = await db.shop.upsert({
    where: { domain: shopDomain },
    create: {
      domain: shopDomain,
      adminLocale: body.adminLocale === "en" ? "en" : "zh-CN",
      defaultSurveyLocale: ["en", "de", "es"].includes(body.defaultSurveyLocale ?? "")
        ? body.defaultSurveyLocale
        : "en",
      contactQuestionsEnabled: body.contactQuestionsEnabled === true,
      timezone: body.timezone || "Asia/Shanghai",
      retentionDays,
      sensitiveRetentionDays,
    },
    update: {
      adminLocale: body.adminLocale === "en" ? "en" : "zh-CN",
      defaultSurveyLocale: ["en", "de", "es"].includes(body.defaultSurveyLocale ?? "")
        ? body.defaultSurveyLocale
        : "en",
      contactQuestionsEnabled: body.contactQuestionsEnabled === true,
      timezone: body.timezone || "Asia/Shanghai",
      retentionDays,
      sensitiveRetentionDays,
    },
  });
  if (body.report) {
    const schedule = {
      locale: body.report.locale === "en" ? "en" : "zh-CN",
      timezone: body.report.timezone || shop.timezone,
      weekday: Math.max(0, Math.min(6, Math.trunc(body.report.weekday ?? 1))),
      hour: Math.max(0, Math.min(23, Math.trunc(body.report.hour ?? 9))),
      enabled: body.report.enabled !== false,
    };
    const suppliedRecipients = body.report.emails ?? (body.report.email !== undefined
      ? body.report.email.split(",")
      : undefined);
    if (suppliedRecipients) {
      const recipients = [...new Set(
        suppliedRecipients
          .map((email) => email.trim().toLowerCase())
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      )].slice(0, 20);
      await db.$transaction(async (tx) => {
        await tx.reportSubscription.deleteMany({ where: { shopDomain } });
        if (recipients.length) {
          await tx.reportSubscription.createMany({
            data: recipients.map((email, index) => ({
              shopDomain,
              recipientEncrypted: encryptText(
                email,
                `shopoll-report-recipient:${shopDomain}`,
              ),
              klaviyoProfileId:
                recipients.length === 1 && index === 0
                  ? body.report?.klaviyoProfileId?.trim() || null
                  : null,
              ...schedule,
            })),
          });
        }
      });
    } else {
      await db.reportSubscription.updateMany({ where: { shopDomain }, data: schedule });
    }
  }
  await db.auditLog.create({
    data: {
      shopDomain,
      actorHash: hashIdentifier(session.id, "admin-actor"),
      action: "settings.updated",
      resourceType: "Shop",
      resourceId: shop.id,
    },
  });
  return Response.json({ saved: true });
};
