import prismaClientPackage, { type Prisma } from "@prisma/client";

const { ResponseStatus } = prismaClientPackage;
import { stringify } from "csv-stringify/sync";


import {
  calculateCsat,
  calculateNps,
  type AnalyticsFilter,
} from "../domain";
import db from "../db.server";


function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}


function answerText(value: Prisma.JsonValue | null): string {
  if (value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(String).join(" | ");
  return JSON.stringify(value);
}


export function escapeCsvFormula(value: string): string {
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}


function csvCell(value: unknown): string | number {
  if (typeof value === "number") return value;
  return escapeCsvFormula(value === null || value === undefined ? "" : String(value));
