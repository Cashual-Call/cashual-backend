import jwt, { SignOptions } from "jsonwebtoken";
import { Socket } from "socket.io";
import { config } from "../config";

const secret =
  process.env.JWT_SECRET ||
  "e2c48ba309f10ee81682892cd24316558e7820ef7b8a2e5c0d661c10217bd5dd";

interface SocketJWTPayload {
  roomId: string;
  senderId: string;
  receiverId: string;
}

declare module "socket.io" {
  interface Socket {
    user: SocketJWTPayload;
  }
}

const socketAuthMiddleware = (socket: Socket, next: any) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.split(" ")[1];

  if (!token) {
    throw new Error("No token provided");
  }

  try {
    const secret = process.env.JWT_SECRET as string;
    const payload = jwt.verify(token, secret) as SocketJWTPayload;

    socket.user = { ...payload };

    return next();
  } catch (err) {
    return next(new Error("Authentication failed"));
  }
};

export const generateToken = (obj: SocketJWTPayload): string => {
  const options: SignOptions = { expiresIn: "7d" };
  return jwt.sign(obj, config.jwt.secret, options);
};

export const verifyToken = (token: string) => {
  try {
    if (!token) {
      throw new Error("No token provided");
    }
    return jwt.verify(token, secret) as SocketJWTPayload;
  } catch (error) {
    console.error(error);
    // console.error("JWT verification failed:", error);

    return {
      roomId: "",
      senderId: "",
      receiverId: "",
    };
  }
};

export default socketAuthMiddleware;
