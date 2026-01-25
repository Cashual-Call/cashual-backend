import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";
import { auth } from "../lib/auth";
import { fromNodeHeaders } from "better-auth/node";
import { SubscriptionService } from "../service/subscription.service";
export interface UserJWTPayload {
	id: string;
	username: string;
	walletAddress?: string;
	name?: string;
	email?: string;
}

declare global {
	namespace Express {
		interface Request {
			user?: UserJWTPayload;
			rawBody?: string;
		}
	}
}

export const generateToken = (obj: UserJWTPayload): string => {
	const options: SignOptions = { expiresIn: "24h" };
	return jwt.sign(obj, config.jwt.secret, options);
};

export const verifyToken = async (
	req: Request,
	res: Response,
	next: NextFunction,
	safe = false,
): Promise<void> => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}
		req.user = session?.user as unknown as UserJWTPayload;
		next();
	} catch (error) {
		if (safe) {
			console.log("Returning from verifyTokenSafe");
			next();
			return;
		}
		res.status(401).json({ message: "Invalid token" });
		return;
	}
};

export const requirePro = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	const userId = req.user?.id;
	if (!userId) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	try {
		const isActive = await SubscriptionService.isUserSubscriptionActive(userId);
		if (!isActive) {
			res.status(403).json({
				message: "Pro subscription required",
			});
			return;
		}

		next();
	} catch (error) {
		console.error("Pro subscription check failed:", error);
		res.status(500).json({ message: "Failed to verify subscription status" });
	}
};
