import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.WEBPUSH_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.WEBPUSH_VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT =
	process.env.WEBPUSH_VAPID_SUBJECT || "mailto:admin@cashual.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export { webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT };
