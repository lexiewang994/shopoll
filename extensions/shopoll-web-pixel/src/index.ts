import {register} from "@shopify/web-pixels-extension";

import {
  buildPayload,
  pseudonymousId,
  resolvePixelProxyEndpoint,
  type PixelEventLike,
} from "./payload";

register(({analytics, browser, customerPrivacy, init, settings}) => {
  let privacy = init.customerPrivacy;
  const shopDomain = String(init.data.shop?.myshopifyDomain ?? "");
  const endpoint = resolvePixelProxyEndpoint(settings.endpointUrl, shopDomain);

  customerPrivacy.subscribe("visitorConsentCollected", (event) => {
    privacy = event.customerPrivacy;
  });

  if (!endpoint || !shopDomain) return;

  let visitorTokenPromise: Promise<string | undefined> | undefined;
  const visitorToken = (clientId?: string) => {
    visitorTokenPromise ??= browser.cookie.get("shopoll_visitor").then(async (existing) => {
      const token = existing || pseudonymousId(clientId, shopDomain);
      if (token && !existing) {
        await browser.cookie.set("shopoll_visitor", token);
      }
      return token;
    }).catch(() => undefined);
    return visitorTokenPromise;
  };

  const send = async (event: PixelEventLike) => {
    if (!privacy.analyticsProcessingAllowed) return;
    const token = await visitorToken(event.clientId);
    void fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopoll-Client": "pixel-v1",
      },
      body: JSON.stringify(buildPayload(event, shopDomain, token)),
      keepalive: true,
    }).catch(() => undefined);
  };

  analytics.subscribe("page_viewed", (event) => void send(event));
  analytics.subscribe("product_viewed", (event) => void send(event));
  analytics.subscribe("product_added_to_cart", (event) => void send(event));
  analytics.subscribe("checkout_started", (event) => void send(event));
  analytics.subscribe("checkout_completed", (event) => void send(event));
});
