import { Request, Response, Router, RequestHandler } from "express";
import Session from "express-session";
import { generateNonce } from "siwe";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { config } from "../config";
import { generateToken, verifyToken } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { Gender } from "@prisma/client";

const router: Router = Router();

declare module "express-session" {
  interface SessionData {
    siwe?: { publicKey: string } | null;
    nonce?: string | null;
  }
}

router.use(
  Session({
    name: config.session.name,
    secret: config.session.secret,
    resave: true,
    saveUninitialized: true,
    cookie: config.session.cookie,
  })
);

router.get("/nonce", function (_, res) {
  res.setHeader("Content-Type", "text/plain");
  res.send(generateNonce());
});

// verify the message
router.post("/verify", (async (req: Request, res: Response) => {
  try {
    if (!req.body.message) {
      return res.status(400).json({ error: "SiweMessage is undefined" });
    }

    const message = req.body.message;
    const signature = req.body.signature;
    const publicKey = req.body.publicKey;

    // Verify the signature using Solana's verify
    const isValid = nacl.sign.detached.verify(
      Buffer.from(message),
      Buffer.from(signature, "base64"),
      new PublicKey(publicKey).toBytes()
    );

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    // Check if user already exists with this public key
    const existingUser = await prisma.user.findUnique({
      where: { publicKey },
    });

    const isNewUser = !existingUser;

    // Generate JWT token
    const token = generateToken({
      publicKey,
      username: existingUser?.username,
      walletAddress: existingUser?.walletAddress,
    });

    // Save the session with the public key
    req.session.siwe = { publicKey };
    req.session.save(() =>
      res.status(200).json({
        token,
        new_user: isNewUser,
        user: existingUser
          ? {
              username: existingUser.username,
              avatarUrl: existingUser.avatarUrl,
              gender: existingUser.gender,
              walletAddress: existingUser.walletAddress,
            }
          : null,
      })
    );
  } catch (e) {
    // clean the session
    req.session.siwe = null;
    req.session.nonce = null;
    req.session.save(() => res.status(500).json({ message: e }));
  }
}) as RequestHandler);

// get the session - now protected with JWT
router.get("/session", verifyToken, (req: Request, res: Response): void => {
  res.setHeader("Content-Type", "application/json");
  console.log(req.user);
  res.json({ ...req.user });
});

router.post(
  "/update-profile",
  verifyToken,
  async (req: Request, res: Response): Promise<void> => {
    const { avatar, username, gender, walletAddress } = req.body;
    const publicKey = req.user?.publicKey || "";

    // TODO: check proper params

    try {
      // Check if user with this public key already exists
      const existingUser = await prisma.user.findUnique({
        where: { publicKey },
      });

      let user;
      let isNewUser = false;

      if (existingUser) {
        // Update existing user
        user = await prisma.user.update({
          where: { publicKey },
          data: {
            avatarUrl: avatar,
            username,
            gender: String(gender).toUpperCase() as Gender,
            walletAddress,
            ipAddress:
              (req.headers["x-forwarded-for"] as string) ||
              req.socket.remoteAddress ||
              "",
          },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            avatarUrl: avatar,
            username,
            gender: String(gender).toUpperCase() as Gender,
            publicKey,
            walletAddress,
            ipAddress:
              (req.headers["x-forwarded-for"] as string) ||
              req.socket.remoteAddress ||
              "",
          },
        });
        isNewUser = true;
      }

      if (user) {
        res.status(200).json({
          message: "Profile updated successfully",
          newUser: isNewUser,
          token: generateToken({
            publicKey: user.publicKey,
            username: user.username,
            walletAddress: user.walletAddress,
          }),
        });
      } else {
        res.status(400).json({ message: "Failed to update profile" });
      }
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
