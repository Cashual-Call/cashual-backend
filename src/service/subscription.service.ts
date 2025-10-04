import { prisma } from "../lib/prisma";

export class SubscriptionService {
  /**
   * Check and update expired subscriptions
   * Sets isPro to false for users whose proEnd date has passed
   */
  static async checkExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date();

      // Find all users with expired pro subscriptions
      const expiredUsers = await prisma.user.findMany({
        where: {
          isPro: true,
          proEnd: {
            lte: now, // proEnd is less than or equal to now
          },
        },
      });

      if (expiredUsers.length === 0) {
        console.log("No expired subscriptions found");
        return;
      }

      console.log(`Found ${expiredUsers.length} expired subscriptions`);

      // Update all expired users
      const updatePromises = expiredUsers.map((user) =>
        prisma.user.update({
          where: { id: user.id },
          data: { isPro: false },
        })
      );

      await Promise.all(updatePromises);

      console.log(`Updated ${expiredUsers.length} expired subscriptions`);
    } catch (error) {
      console.error("Error checking expired subscriptions:", error);
      throw error;
    }
  }

  /**
   * Get subscription statistics
   */
  static async getSubscriptionStats(): Promise<{
    totalProUsers: number;
    activeSubscriptions: number;
    expiredSubscriptions: number;
    totalRevenue: number;
  }> {
    try {
      const now = new Date();

      const [totalProUsers, activeSubscriptions, expiredSubscriptions, allSubscriptions] =
        await Promise.all([
          prisma.user.count({
            where: { isPro: true },
          }),
          prisma.user.count({
            where: {
              isPro: true,
              proEnd: {
                gt: now,
              },
            },
          }),
          prisma.user.count({
            where: {
              isPro: true,
              proEnd: {
                lte: now,
              },
            },
          }),
          prisma.subscription.findMany({
            select: {
              plan: true,
            },
          }),
        ]);

      // Calculate total revenue (example pricing)
      const totalRevenue = allSubscriptions.reduce((sum, sub) => {
        const amount = sub.plan === "MONTHLY" ? 5.99 : 59.99;
        return sum + amount;
      }, 0);

      return {
        totalProUsers,
        activeSubscriptions,
        expiredSubscriptions,
        totalRevenue,
      };
    } catch (error) {
      console.error("Error getting subscription stats:", error);
      throw error;
    }
  }

  /**
   * Check if a user has an active subscription
   */
  static async isUserSubscriptionActive(userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          isPro: true,
          proEnd: true,
        },
      });

      if (!user || !user.isPro || !user.proEnd) {
        return false;
      }

      return new Date(user.proEnd) > new Date();
    } catch (error) {
      console.error("Error checking user subscription:", error);
      return false;
    }
  }

  /**
   * Extend user's subscription
   */
  static async extendSubscription(
    userId: string,
    planType: "week" | "month" | "annual"
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Calculate new end date based on current proEnd or now
      const baseDate = user.proEnd && new Date(user.proEnd) > new Date()
        ? new Date(user.proEnd)
        : new Date();

      let newProEnd: Date;
      switch (planType) {
        case "week":
          newProEnd = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          newProEnd = new Date(baseDate);
          newProEnd.setMonth(newProEnd.getMonth() + 1);
          break;
        case "annual":
          newProEnd = new Date(baseDate);
          newProEnd.setFullYear(newProEnd.getFullYear() + 1);
          break;
        default:
          throw new Error("Invalid plan type");
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          isPro: true,
          proEnd: newProEnd,
        },
      });

      console.log(`Extended subscription for user ${userId} until ${newProEnd.toISOString()}`);
    } catch (error) {
      console.error("Error extending subscription:", error);
      throw error;
    }
  }
}

