import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";

const secret =
	process.env.JWT_SECRET ||
	"e2c48ba309f10ee81682892cd24316558e7820ef7b8a2e5c0d661c10217bd5dd";

interface SocketJWTPayload {
	roomId: string;
	senderId: string;
	receiverId: string;
	senderUsername?: string;
	receiverUsername?: string;
}

declare module "socket.io" {
	interface Socket {
		user: SocketJWTPayload;
	}
}

export const generateToken = (
	obj: SocketJWTPayload,
	expiresIn: number | string | undefined = "7d",
): string => {
	const options: SignOptions = { expiresIn: expiresIn as any };
	return jwt.sign(obj, config.jwt.secret, options);
};

export const verifyToken = (token: string) => {
	try {
		if (!token) {
			throw new Error("No token provided");
		}

		const decoded = jwt.verify(token, secret) as SocketJWTPayload;

		if (!decoded.roomId || !decoded.senderId || !decoded.receiverId) {
			throw new Error("Invalid token format");
		}

		return decoded;
	} catch (error) {
		console.error("Token verification failed:", error);

		return {
			roomId: "",
			senderId: "",
			receiverId: "",
		};
	}
};

