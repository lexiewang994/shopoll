import "@shopify/ui-extensions/purchase.thank-you.block.render";
import "@shopify/ui-extensions/customer-account.order-status.block.render";

declare global {
  const shopify: unknown;

  const process:
    | {
        env: {
          SHOPIFY_APP_URL?: string;
        };
      }
    | undefined;
}

export {};
