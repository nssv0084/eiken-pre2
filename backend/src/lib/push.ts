import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import webpush from "web-push";
import { addDays, studyDate } from "../../../shared/dates";
import type { PushSubscriptionRecord, Streak, UserProfile } from "../../../shared/types";
import type { CognitoUser } from "./cognito";
import { updateProfile } from "./profiles";

export const MAX_PUSH_DEVICES = 5;

// 送信先を主要ブラウザのプッシュサービスに限る（任意の URL へ Lambda から POST させないため）
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export function addSubscription(
  list: PushSubscriptionRecord[] | undefined,
  sub: PushSubscriptionRecord,
): PushSubscriptionRecord[] {
  return [...(list ?? []).filter((s) => s.endpoint !== sub.endpoint), sub].slice(-MAX_PUSH_DEVICES);
}

export function reminderTargets(profiles: UserProfile[], users: CognitoUser[], today: string): UserProfile[] {
  const enabled = new Set(users.filter((u) => u.enabled).map((u) => u.sub));
  return profiles.filter(
    (p) => p.role === "student" && enabled.has(p.sub) && (p.pushSubscriptions?.length ?? 0) > 0 && p.streak.lastDate !== today,
  );
}

export interface PushMessage {
  title: string;
  body: string;
}

export function reminderMessage(streak: Streak, today: string): PushMessage {
  if (streak.count > 0 && streak.lastDate === addDays(today, -1)) {
    return {
      title: `🔥 連続${streak.count}日が今日で途切れます`,
      body: "10問解くだけでも記録がつながります。少しだけ進めましょう。",
    };
  }
  return { title: "今日の学習がまだです", body: "10問解くだけでも「学習した日」になります。5分だけ始めてみましょう。" };
}

export const TEST_MESSAGE: PushMessage = {
  title: "テスト通知",
  body: "通知は届いています。毎日20時に、まだ学習していない日だけお知らせします。",
};

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const sm = new SecretsManagerClient({});
let cachedKeys: VapidKeys | undefined;

// 同時に作ろうとしても1組だけ保存されるように、固定のトークンで書き込む（2回目以降は ResourceExistsException）
const INITIAL_KEYS_TOKEN = "vapid-keys-initial-0000000000000001";

function parseKeys(s: string | undefined): VapidKeys | undefined {
  try {
    const v = JSON.parse(s ?? "");
    return typeof v.publicKey === "string" && typeof v.privateKey === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

async function readKeys(): Promise<VapidKeys | undefined> {
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.VAPID_SECRET_ID }));
  return parseKeys(res.SecretString);
}

// 鍵がまだなければ作って Secrets Manager に保存する（作るのは API 側だけ。リマインダーは読むだけ）
export async function getVapidKeys(create: boolean): Promise<VapidKeys | undefined> {
  cachedKeys ??= await readKeys();
  if (cachedKeys || !create) return cachedKeys;
  const keys = webpush.generateVAPIDKeys();
  try {
    await sm.send(
      new PutSecretValueCommand({
        SecretId: process.env.VAPID_SECRET_ID,
        SecretString: JSON.stringify(keys),
        ClientRequestToken: INITIAL_KEYS_TOKEN,
      }),
    );
    cachedKeys = keys;
  } catch (e) {
    if ((e as Error).name !== "ResourceExistsException") throw e;
    cachedKeys = await readKeys();
  }
  return cachedKeys;
}

// 登録した端末すべてに送り、プッシュサービスが「登録なし」と返したものはプロフィールから消す
export async function sendToProfile(profile: UserProfile, message: PushMessage, keys: VapidKeys) {
  const subs = profile.pushSubscriptions ?? [];
  const gone = new Set<string>();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(s, JSON.stringify({ ...message, url: "/" }), {
        vapidDetails: { subject: process.env.SITE_ORIGIN ?? "", ...keys },
        // 夜中に遅れて届かないよう、4時間で破棄させる
        TTL: 4 * 60 * 60,
        topic: "daily-reminder",
      });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.add(s.endpoint);
      else console.error(`push failed for ${profile.username}: ${status ?? (e as Error).message}`);
    }
  }
  if (gone.size > 0) {
    await updateProfile(profile.sub, { pushSubscriptions: subs.filter((s) => !gone.has(s.endpoint)) });
  }
  return { sent, removed: gone.size };
}

export async function sendReminders(profiles: UserProfile[], users: CognitoUser[], today = studyDate()) {
  const targets = reminderTargets(profiles, users, today);
  if (targets.length === 0) return { targets: 0, sent: 0, removed: 0 };
  const keys = await getVapidKeys(false);
  if (!keys) return { targets: targets.length, sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;
  for (const p of targets) {
    const r = await sendToProfile(p, reminderMessage(p.streak, today), keys);
    sent += r.sent;
    removed += r.removed;
  }
  return { targets: targets.length, sent, removed };
}
