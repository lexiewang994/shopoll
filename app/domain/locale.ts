import { SURVEY_LOCALES } from "./types";
import type { LocalizedText, SurveyLocale } from "./types";

export function normalizeSurveyLocale(locale: string | null | undefined): SurveyLocale | null {
  if (!locale) return null;
  const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
  return SURVEY_LOCALES.find((candidate) => candidate === language) ?? null;
}

export function resolveSurveyLocale(
  requestedLocale: string | null | undefined,
  enabledLocales: readonly SurveyLocale[],
  defaultLocale: SurveyLocale = "en",
): SurveyLocale {
  const normalized = normalizeSurveyLocale(requestedLocale);
  if (normalized && enabledLocales.includes(normalized)) return normalized;
  if (enabledLocales.includes("en")) return "en";
  if (enabledLocales.includes(defaultLocale)) return defaultLocale;
  return enabledLocales[0] ?? "en";
}

export function localizeText(
  text: LocalizedText,
  requestedLocale: string | null | undefined,
  enabledLocales: readonly SurveyLocale[] = SURVEY_LOCALES,
  defaultLocale: SurveyLocale = "en",
): string {
  const locale = resolveSurveyLocale(requestedLocale, enabledLocales, defaultLocale);
  return text[locale] ?? text[defaultLocale] ?? text.en ?? "";
}
