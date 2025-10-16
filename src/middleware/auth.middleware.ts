import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";
import { auth } from "../lib/auth";
import { fromNodeHeaders } from "better-auth/node";
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
  safe = false
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

export const verifyTokenSafe = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  verifyToken(req, res, next, true);
};

export const verifyTokenForLogin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as UserJWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }
};
