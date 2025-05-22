import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const SECRET_KEY = "cashual";

export const getUserId = (ipAddress: string) => {
  const uuid = uuidv4();
  const hmac = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(uuid)
    .digest("hex")
    .slice(0, 12);
  return `usr_${uuid}_${hmac}`;
};

export const verifyUserId = (userId: string) => {
  const parts = userId.split("_");
  if (parts.length !== 3 || parts[0] !== "usr") return false;

  const [_, uuid, hmac] = parts;
  const expectedHmac = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(uuid)
    .digest("hex")
    .slice(0, 12);
  return hmac === expectedHmac;
};
