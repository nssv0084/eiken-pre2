import { api } from "./api";

export type PushState = "unsupported" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function registerServiceWorker() {
  if (pushSupported()) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const { endpoint, keys } = sub.toJSON();
  await api("PUT", "/push/subscription", { endpoint, keys });
}

export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("GET", "/push/key");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  await saveSubscription(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api("DELETE", "/push/subscription", { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

// 端末に登録が残っていればサーバー側にも登録し直す（サーバー側で消えていても復活させる）
export async function resyncPush(): Promise<void> {
  if ((await getPushState()) !== "on") return;
  const sub = await currentSubscription();
  if (sub) await saveSubscription(sub);
}
