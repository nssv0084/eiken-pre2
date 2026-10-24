import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { z } from "zod";
import type { Caller } from "./lib/auth";
import { HttpError, parseBody } from "./lib/http";
import { getOrCreateProfile, updateProfile } from "./lib/profiles";
import { addSubscription, getVapidKeys, isAllowedEndpoint, sendToProfile, TEST_MESSAGE } from "./lib/push";

export async function getPushKey() {
  const keys = await getVapidKeys(true);
  if (!keys) throw new Error("VAPID keys unavailable");
  return { publicKey: keys.publicKey };
}

const Subscription = z.object({
  endpoint: z.string().max(1000).refine(isAllowedEndpoint, "この通知の送信先は使えません"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function subscribePush(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const parsed = Subscription.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { endpoint, keys } = parsed.data;
  const profile = await getOrCreateProfile(caller);
  const pushSubscriptions = addSubscription(profile.pushSubscriptions, { endpoint, keys, createdAt: new Date().toISOString() });
  await updateProfile(profile.sub, { pushSubscriptions });
  return { ok: true };
}

const Unsubscribe = z.object({ endpoint: z.string().min(1).max(1000) });

export async function unsubscribePush(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const parsed = Unsubscribe.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, "入力が正しくありません");
  const profile = await getOrCreateProfile(caller);
  const rest = (profile.pushSubscriptions ?? []).filter((s) => s.endpoint !== parsed.data.endpoint);
  await updateProfile(profile.sub, { pushSubscriptions: rest });
  return { ok: true };
}

export async function sendTestPush(caller: Caller) {
  const profile = await getOrCreateProfile(caller);
  if (!profile.pushSubscriptions?.length) throw new HttpError(400, "通知がオンになっていません");
  const keys = await getVapidKeys(true);
  if (!keys) throw new Error("VAPID keys unavailable");
  const { sent } = await sendToProfile(profile, TEST_MESSAGE, keys);
  if (sent === 0) throw new HttpError(400, "通知を送れませんでした。もう一度オンにしてください");
  return { sent };
}
