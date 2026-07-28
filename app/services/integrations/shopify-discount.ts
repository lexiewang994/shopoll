export type ShopifyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type DiscountCombinationRules = Partial<{
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}>;

export type RewardValue =
  | { type: "percentage"; percentage: number }
  | { type: "fixed_amount"; amount: string }
  | { type: "free_shipping"; maximumShippingPrice?: string | null };

export interface ShopifyDiscountRewardRequest {
  code: string;
  title?: string;
  reward: RewardValue;
  startsAt?: Date | string;
  /** Undefined applies the 14-day default. Null intentionally has no expiry. */
  endsAt?: Date | string | null;
  validForDays?: number;
  minimumSubtotal?: string;
  appliesToProductIds?: readonly string[];
  combinesWith?: DiscountCombinationRules;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
}

export interface ShopifyDiscountGraphqlRequest {
  query: string;
  variables: Record<string, unknown>;
  mutation: "discountCodeBasicCreate" | "discountCodeFreeShippingCreate";
}

export interface ShopifyDiscountRewardResult {
  discountNodeId: string;
  code: string;
  rewardType: RewardValue["type"];
  startsAt: string;
  endsAt: string | null;
}

export interface ShopifyDiscountUserError {
  field?: string[];
  message: string;
  code?: string;
}

interface ShopifyGraphqlResponse {
  data?: Record<
    string,
    | {
        codeDiscountNode?: { id?: string } | null;
        userErrors?: ShopifyDiscountUserError[];
      }
    | undefined
  >;
  errors?: Array<{ message: string }>;
}

export class ShopifyDiscountError extends Error {
  readonly status?: number;
  readonly userErrors: readonly ShopifyDiscountUserError[];

  constructor(
    message: string,
    options: { status?: number; userErrors?: ShopifyDiscountUserError[] } = {},
  ) {
    super(message);
    this.name = "ShopifyDiscountError";
    this.status = options.status;
    this.userErrors = options.userErrors ?? [];
  }
}

const BASIC_DISCOUNT_MUTATION = `#graphql
mutation ShopollDiscountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`;

const FREE_SHIPPING_MUTATION = `#graphql
mutation ShopollDiscountCodeFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
  discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`;

function toIsoDate(value: Date | string, label: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return date.toISOString();
}

function decimal(value: string, label: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive decimal`);
  }
  return value;
}

function normalizedDates(
  request: ShopifyDiscountRewardRequest,
  now: Date,
): { startsAt: string; endsAt: string | null } {
  const startsAt = toIsoDate(request.startsAt ?? now, "startsAt");
  if (request.endsAt === null) return { startsAt, endsAt: null };
  if (request.endsAt !== undefined) {
    const endsAt = toIsoDate(request.endsAt, "endsAt");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new Error("endsAt must be later than startsAt");
    }
    return { startsAt, endsAt };
  }

  const validForDays = request.validForDays ?? 14;
  if (!Number.isInteger(validForDays) || validForDays < 1) {
    throw new Error("validForDays must be a positive integer");
  }
  const endsAt = new Date(Date.parse(startsAt));
  endsAt.setUTCDate(endsAt.getUTCDate() + validForDays);
  return { startsAt, endsAt: endsAt.toISOString() };
}

function commonInput(
  request: ShopifyDiscountRewardRequest,
  dates: { startsAt: string; endsAt: string | null },
): Record<string, unknown> {
  if (request.code.trim().length === 0) {
    throw new Error("Discount code must not be empty");
  }
  const usageLimit = request.usageLimit ?? 1;
  if (!Number.isInteger(usageLimit) || usageLimit < 1) {
    throw new Error("usageLimit must be a positive integer");
  }

  const combinesWith = {
    orderDiscounts: request.combinesWith?.orderDiscounts ?? false,
    productDiscounts: request.combinesWith?.productDiscounts ?? false,
    shippingDiscounts: request.combinesWith?.shippingDiscounts ?? false,
  };

  return {
    title: request.title?.trim() || `Shopoll reward ${request.code}`,
    code: request.code,
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
    context: { all: true },
    combinesWith,
    usageLimit,
    appliesOncePerCustomer: request.appliesOncePerCustomer ?? true,
    ...(request.minimumSubtotal
      ? {
          minimumRequirement: {
            subtotal: {
              greaterThanOrEqualToSubtotal: decimal(
                request.minimumSubtotal,
                "minimumSubtotal",
              ),
            },
          },
        }
      : {}),
  };
}

export function buildShopifyDiscountGraphqlRequest(
  request: ShopifyDiscountRewardRequest,
  now = new Date(),
): ShopifyDiscountGraphqlRequest {
  const dates = normalizedDates(request, now);
  const base = commonInput(request, dates);

  if (request.reward.type === "free_shipping") {
    if (request.appliesToProductIds?.length) {
      throw new Error("Free-shipping rewards cannot be limited by product ID");
    }
    const freeShippingCodeDiscount = {
      ...base,
      destination: { all: true },
      ...(request.reward.maximumShippingPrice
        ? {
            maximumShippingPrice: decimal(
              request.reward.maximumShippingPrice,
              "maximumShippingPrice",
            ),
          }
        : {}),
    };
    return {
      query: FREE_SHIPPING_MUTATION,
      variables: { freeShippingCodeDiscount },
      mutation: "discountCodeFreeShippingCreate",
    };
  }

  const productIds = request.appliesToProductIds?.filter(Boolean) ?? [];
  const items = productIds.length
    ? { products: { productsToAdd: productIds } }
    : { all: true };
  const value =
    request.reward.type === "percentage"
      ? (() => {
          if (
            !Number.isFinite(request.reward.percentage) ||
            request.reward.percentage <= 0 ||
            request.reward.percentage > 100
          ) {
            throw new Error("percentage must be greater than 0 and at most 100");
          }
          return { percentage: request.reward.percentage / 100 };
        })()
      : {
          discountAmount: {
            amount: decimal(request.reward.amount, "amount"),
            appliesOnEachItem: false,
          },
        };

  return {
    query: BASIC_DISCOUNT_MUTATION,
    variables: {
      basicCodeDiscount: {
        ...base,
        customerGets: { value, items },
      },
    },
    mutation: "discountCodeBasicCreate",
  };
}

export interface ShopifyDiscountClientOptions {
  shopDomain: string;
  accessToken: string;
  fetch?: ShopifyFetch;
  apiVersion?: string;
  now?: () => Date;
}

function normalizeShopDomain(shopDomain: string): string {
  const normalized = shopDomain.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error("shopDomain must be a myshopify.com hostname");
  }
  return normalized;
}

export class ShopifyDiscountClient {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly fetch: ShopifyFetch;
  private readonly now: () => Date;

  constructor(options: ShopifyDiscountClientOptions) {
    if (options.accessToken.length === 0) {
      throw new Error("Shopify access token must not be empty");
    }
    const shopDomain = normalizeShopDomain(options.shopDomain);
    const apiVersion = options.apiVersion ?? "2026-07";
    if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
      throw new Error("Shopify API version must use YYYY-MM format");
    }

    this.endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
    this.accessToken = options.accessToken;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async createReward(
    request: ShopifyDiscountRewardRequest,
  ): Promise<ShopifyDiscountRewardResult> {
    const dates = normalizedDates(request, this.now());
    const graphqlRequest = buildShopifyDiscountGraphqlRequest(
      { ...request, startsAt: dates.startsAt, endsAt: dates.endsAt },
      this.now(),
    );
    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-shopify-access-token": this.accessToken,
      },
      body: JSON.stringify({
        query: graphqlRequest.query,
        variables: graphqlRequest.variables,
      }),
    });

    if (!response.ok) {
      throw new ShopifyDiscountError(
        `Shopify Admin API request failed with status ${response.status}`,
        { status: response.status },
      );
    }

    let body: ShopifyGraphqlResponse;
    try {
      body = (await response.json()) as ShopifyGraphqlResponse;
    } catch {
      throw new ShopifyDiscountError("Shopify Admin API returned invalid JSON", {
        status: response.status,
      });
    }

    if (body.errors?.length) {
      throw new ShopifyDiscountError(
        `Shopify GraphQL error: ${body.errors.map((error) => error.message).join("; ")}`,
        { status: response.status },
      );
    }

    const payload = body.data?.[graphqlRequest.mutation];
    if (payload?.userErrors?.length) {
      throw new ShopifyDiscountError("Shopify rejected the discount reward", {
        status: response.status,
        userErrors: payload.userErrors,
      });
    }
    const discountNodeId = payload?.codeDiscountNode?.id;
    if (!discountNodeId) {
      throw new ShopifyDiscountError(
        "Shopify discount response did not include a discount node ID",
        { status: response.status },
      );
    }

    return {
      discountNodeId,
      code: request.code,
      rewardType: request.reward.type,
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
    };
  }
}
