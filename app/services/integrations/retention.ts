export const DEFAULT_RETENTION_POLICY = Object.freeze({
  standardMonths: 24,
  contactDays: 90,
  uninstallGraceDays: 30,
});

export interface RetentionPolicy {
  standardMonths: number;
  contactDays: number;
  uninstallGraceDays: number;
}

export type RetentionCategory = "contact" | "standard";

export interface RetentionCutoffs {
  /** Standard records created at or before this time are eligible for deletion. */
  standardCreatedAt: Date;
  /** Encrypted contact answers created at or before this time are eligible. */
  contactCreatedAt: Date;
  /** Shops uninstalled at or before this time are eligible for full deletion. */
  uninstalledAt: Date;
}

function assertDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
}

function assertPolicy(policy: RetentionPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer`);
    }
  }
}

function shiftUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function shiftUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function buildRetentionCutoffs(
  now = new Date(),
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): RetentionCutoffs {
  assertDate(now, "now");
  assertPolicy(policy);

  return {
    standardCreatedAt: shiftUtcMonths(now, -policy.standardMonths),
    contactCreatedAt: shiftUtcDays(now, -policy.contactDays),
    uninstalledAt: shiftUtcDays(now, -policy.uninstallGraceDays),
  };
}

export function retentionExpiresAt(
  createdAt: Date,
  category: RetentionCategory,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): Date {
  assertDate(createdAt, "createdAt");
  assertPolicy(policy);
  return category === "contact"
    ? shiftUtcDays(createdAt, policy.contactDays)
    : shiftUtcMonths(createdAt, policy.standardMonths);
}

export function uninstallDeletionAt(
  uninstalledAt: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): Date {
  assertDate(uninstalledAt, "uninstalledAt");
  assertPolicy(policy);
  return shiftUtcDays(uninstalledAt, policy.uninstallGraceDays);
}

export function effectiveDeletionAt(input: {
  createdAt: Date;
  category: RetentionCategory;
  uninstalledAt?: Date;
  policy?: RetentionPolicy;
}): Date {
  const policy = input.policy ?? DEFAULT_RETENTION_POLICY;
  const normalExpiry = retentionExpiresAt(input.createdAt, input.category, policy);
  if (!input.uninstalledAt) return normalExpiry;

  const uninstallExpiry = uninstallDeletionAt(input.uninstalledAt, policy);
  return uninstallExpiry < normalExpiry ? uninstallExpiry : normalExpiry;
}

export function isDeletionDue(deletionAt: Date, now = new Date()): boolean {
  assertDate(deletionAt, "deletionAt");
  assertDate(now, "now");
  return deletionAt.getTime() <= now.getTime();
}
