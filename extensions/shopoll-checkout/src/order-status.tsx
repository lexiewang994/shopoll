import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useCallback, useMemo} from "preact/hooks";
import type {Api} from "@shopify/ui-extensions/customer-account.order-status.block.render";

import {resolveApiBase} from "./backend";
import {SurveyRunner} from "./survey-runner";
import {settingsValue, signalValue, translate, useSignalValue} from "./shopify-context";

interface Order {
  id?: string;
  confirmationNumber?: string;
}

export default function extension() {
  render(<OrderStatusSurvey />, document.body);
}

function OrderStatusSurvey() {
  const api = shopify as unknown as Api;
  const order = useSignalValue<Order>(api.order);
  const settings = settingsValue(api);
  const language = signalValue<{isoCode?: string}>(api.localization.extensionLanguage);
  const country = signalValue<{isoCode?: string}>(api.localization.country);
  const apiBase = resolveApiBase(settings.api_url);
  const placementKey = String(settings.order_status_placement ?? "order-status");
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
      surface: "order_status" as const,
      placementKey,
      orderGid: order?.id ?? "",
      orderConfirmationNumber: order?.confirmationNumber ?? "",
      locale: language?.isoCode ?? "en",
      country: country?.isoCode,
    }),
    [country?.isoCode, language?.isoCode, order?.confirmationNumber, order?.id, placementKey],
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
