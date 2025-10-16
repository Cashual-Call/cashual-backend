import { Request, Response, Router, RequestHandler } from "express";
import Session from "express-session";
import { generateNonce } from "siwe";
import nacl from "tweetnacl";
import { config } from "../config";
import { generateToken, verifyToken } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";

const router: Router = Router();

declare module "express-session" {
  interface SessionData {
    siwe?: { username: string } | null;
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
    const username = req.body.username;

    // Verify the signature using Solana's verify
    const isValid = nacl.sign.detached.verify(
      Buffer.from(message),
      Buffer.from(signature, "base64"),
      new username(username).toBytes()
    );

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    // Check if user already exists with this public key
    const existingUser = await prisma.user.findUnique({
      where: { username: username },
    });

    const isNewUser = !existingUser;

    // Generate JWT token
    const token = generateToken({
      id: existingUser?.id || "",
      username,
      walletAddress: existingUser?.walletAddress || "",
    });

    // Save the session with the public key
    req.session.siwe = { username };
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
              isPro: existingUser.isPro,
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
  res.json({ ...req.user });
});


export default router;
