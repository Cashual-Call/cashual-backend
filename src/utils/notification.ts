import { webpush } from "../config/webpush";

export async function sendWebPushNotification(
  subscription: webpush.PushSubscription,
  payload: any,
  options?: webpush.RequestOptions
) {
  try {
    const payloadString =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    await webpush.sendNotification(subscription, payloadString, options);
    return { success: true };
  } catch (error: any) {
    return { success: false, error };
  }
}
