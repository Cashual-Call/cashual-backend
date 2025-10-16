export const pricing = [
  {
    title: "Pro Weekly",
    price: "$0.99",
    period: "week",
    description:
      "Upgrade for filters, no ads, and unlock the full Cashual experience.",
  },
  {
    title: "Pro Monthly",
    price: "$2.99",
    period: "month",
    description: "Same Pro perks, more value. Ideal for regular users.",
  },
  {
    title: "Pro Annual",
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
