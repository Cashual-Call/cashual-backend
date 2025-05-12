import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';

interface UserJWTPayload {
  publicKey: string;
  walletAddress?: string;
  username?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserJWTPayload;
    }
  }
}

export const generateToken = (obj: object): string => {
  const options: SignOptions = { expiresIn: '24h' };
  return jwt.sign({ ...obj }, config.jwt.secret, options);
};

export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as UserJWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }
};

export const verifyTokenForLogin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as UserJWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }
}; 