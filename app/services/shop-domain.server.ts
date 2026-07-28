export function canonicalShopDomain(authenticatedShop?: string): string {
  const normalizedAuthenticated = authenticatedShop?.trim().toLowerCase();
  const allowedShop = process.env.SHOPIFY_SHOP_DOMAIN?.trim().toLowerCase();
  if (!allowedShop && process.env.NODE_ENV === "production") {
    throw new Error("SHOPIFY_SHOP_DOMAIN must be configured in production");
  }
  if (normalizedAuthenticated && allowedShop && normalizedAuthenticated !== allowedShop) {
    throw new Response("This private Shopoll app is not available for this shop", {
      status: 403,
    });
  }
  const configured = process.env.SHOP_CUSTOM_DOMAIN?.trim().toLowerCase();
  if (configured) return configured;
  if (!normalizedAuthenticated) throw new Error("A Shopify shop domain is required");
  return normalizedAuthenticated;
}

export function shopDomainAliases(authenticatedShop?: string): readonly string[] {
  return [
    ...new Set(
      [authenticatedShop?.toLowerCase(), canonicalShopDomain(authenticatedShop)].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
}
