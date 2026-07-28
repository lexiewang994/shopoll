import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useCallback, useMemo} from "preact/hooks";
import type {Api} from "@shopify/ui-extensions/purchase.thank-you.block.render";

import {resolveApiBase} from "./backend";
import {SurveyRunner} from "./survey-runner";
import {settingsValue, signalValue, translate, useSignalValue} from "./shopify-context";

interface OrderConfirmation {
  order?: {id?: string};
  number?: string;
}

export default function extension() {
  render(<ThankYouSurvey />, document.body);
}

function ThankYouSurvey() {
  const api = shopify as unknown as Api;
  const confirmation = useSignalValue<OrderConfirmation>(api.orderConfirmation);
  const settings = settingsValue(api);
  const language = signalValue<{isoCode?: string}>(api.localization.extensionLanguage);
  const country = signalValue<{isoCode?: string}>(api.localization.country);
  const apiBase = resolveApiBase(settings.api_url);
  const placementKey = String(settings.thank_you_placement ?? "thank-you");
  const extensionInfo = api.extension as typeof api.extension & {editor?: unknown};
  const getSessionToken = useCallback(
    () => api.sessionToken.get() as Promise<string>,
    [api],
  );
  const translateForBuyer = useCallback(
    (key: string, replacements?: Record<string, string | number>) =>
      translate(api, key, replacements),
    [api],
  );
  const context = useMemo(
    () => ({
      surface: "thank_you" as const,
      placementKey,
      orderGid: confirmation?.order?.id ?? "",
      orderConfirmationNumber: confirmation?.number ?? "",
      locale: language?.isoCode ?? "en",
      country: country?.isoCode,
    }),
    [confirmation?.number, confirmation?.order?.id, country?.isoCode, language?.isoCode, placementKey],
  );

  return (
    <SurveyRunner
      apiBase={apiBase}
      context={context}
      getSessionToken={getSessionToken}
      isEditorPreview={"editor" in extensionInfo && Boolean(extensionInfo.editor)}
      translate={translateForBuyer}
    />
  );
}
