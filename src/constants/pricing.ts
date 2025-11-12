export const pricing = [
  {
    product_id: "80b7c963-5bb8-46a6-8534-c24c61e3040c",
    slug: "pro-weekly",
    title: "Pro Weekly",
    price: "$0.99",
    period: "week",
    description:
      "Upgrade for filters, no ads, and unlock the full Cashual experience.",
  },
  {
    product_id: "c0c51722-107b-43a3-bf97-e1beb1049eed",
    slug: "pro-monthly",
    title: "Pro Monthly",
    price: "$2.99",
    period: "month",
    description: "Same Pro perks, more value. Ideal for regular users.",
  },
  {
    product_id: "b438598a-27f5-4e5c-83f7-f64f2cd1681a",
    slug: "pro-annually",
    title: "Pro Annualy",
    price: "$29.99",
    period: "year",
    description:
      "For the serious vibers — get the full year and save even more.",
  },
] as const;

// Plan prices in cents
export const PLAN_PRICES = {
  week: 99,     // $0.99
  month: 299,   // $2.99
  annual: 2999, // $29.99
} as const;

export type PlanType = keyof typeof PLAN_PRICES;
export const polar_products = pricing.map((product) => ({
  productId: product.product_id,
  slug: product.slug,
}));
