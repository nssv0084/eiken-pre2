import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushSubscriptionRecord, UserProfile } from "../../shared/types";
import type { CognitoUser } from "../src/lib/cognito";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: { sendNotification: (...a: unknown[]) => sendNotification(...a), generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }) },
}));

const smSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = (...a: unknown[]) => smSend(...a);
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
  PutSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));

const updateProfile = vi.fn();
const getOrCreateProfile = vi.fn();
vi.mock("../src/lib/profiles", () => ({
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  getOrCreateProfile: (...a: unknown[]) => getOrCreateProfile(...a),
}));

const push = await import("../src/lib/push");
const { subscribePush } = await import("../src/push-api");

const TODAY = "2026-10-24";
const sub = (n: number): PushSubscriptionRecord => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device${n}`,
  keys: { p256dh: "p", auth: "a" },
  createdAt: `2026-10-0${n}T00:00:00Z`,
});
const profile = (o: Partial<UserProfile>): UserProfile =>
  ({ sub: "s1", username: "taro", role: "student", streak: { count: 0 }, pushSubscriptions: [sub(1)], ...o }) as UserProfile;
const user = (sub: string, enabled = true) => ({ sub, enabled }) as CognitoUser;

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue({});
  updateProfile.mockReset();
  smSend.mockReset().mockResolvedValue({ SecretString: JSON.stringify({ publicKey: "pub", privateKey: "priv" }) });
});

describe("学習リマインダーの送信先", () => {
  it("[STK-12] 今日まだ学習していない、通知オンの生徒だけに送る", () => {
    const profiles = [
      profile({ sub: "a", streak: { count: 3, lastDate: "2026-10-23" } }),
      profile({ sub: "b", streak: { count: 4, lastDate: TODAY } }),
      profile({ sub: "c", pushSubscriptions: [] }),
      profile({ sub: "d", role: "teacher" }),
      profile({ sub: "e" }),
      profile({ sub: "f" }),
    ];
    const users = ["a", "b", "c", "d", "e"].map((s) => user(s)).concat(user("f", false));
    expect(push.reminderTargets(profiles, users, TODAY).map((p) => p.sub)).toEqual(["a", "e"]);
  });

  it("[STK-12] 対象の生徒の端末すべてに送る", async () => {
    const r = await push.sendReminders([profile({ pushSubscriptions: [sub(1), sub(2)] })], [user("s1")], TODAY);
    expect(r).toEqual({ targets: 1, sent: 2, removed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [, payload, options] = sendNotification.mock.calls[0];
    expect(JSON.parse(payload)).toMatchObject({ url: "/" });
    expect(options.vapidDetails).toMatchObject({ publicKey: "pub", privateKey: "priv" });
  });
});

describe("通知の文面", () => {
  it("[STK-13] 前日まで連続していれば、途切れることを伝える", () => {
    expect(push.reminderMessage({ count: 5, lastDate: "2026-10-23" }, TODAY).title).toBe("🔥 連続5日が今日で途切れます");
  });

  it("[STK-13] 連続が途切れていれば、学習がまだだと伝える", () => {
    expect(push.reminderMessage({ count: 5, lastDate: "2026-10-20" }, TODAY).title).toBe("今日の学習がまだです");
    expect(push.reminderMessage({ count: 0 }, TODAY).title).toBe("今日の学習がまだです");
  });
});

describe("通知の登録", () => {
  it("[STK-14] 同じ端末は上書きし、最新の5台まで持つ", () => {
    const list = [1, 2, 3, 4, 5].map(sub);
    const added = push.addSubscription(list, sub(6));
    expect(added.map((s) => s.endpoint.slice(-7))).toEqual(["device2", "device3", "device4", "device5", "device6"]);
    expect(push.addSubscription([sub(1), sub(2)], { ...sub(1), createdAt: "new" })).toEqual([sub(2), { ...sub(1), createdAt: "new" }]);
  });

  it("[STK-15] 主要なプッシュサービスの HTTPS の URL だけを受け付ける", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
    ]) {
      expect(push.isAllowedEndpoint(ok), ok).toBe(true);
    }
    for (const ng of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://evil.example/push.services.mozilla.com",
      "not a url",
    ]) {
      expect(push.isAllowedEndpoint(ng), ng).toBe(false);
    }
  });

  it("[STK-15] 許可していない送信先の登録は400で、保存しない", async () => {
    getOrCreateProfile.mockResolvedValue(profile({}));
    const body = JSON.stringify({ endpoint: "https://evil.example/x", keys: { p256dh: "p", auth: "a" } });
    await expect(
      subscribePush({ sub: "s1", username: "taro", nickname: "", role: "student" }, { body } as APIGatewayProxyEventV2WithJWTAuthorizer),
    ).rejects.toMatchObject({ status: 400 });
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

describe("届かない登録", () => {
  it("[STK-16] 404・410 が返った登録だけ削除し、ほかのエラーでは消さない", async () => {
    sendNotification
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error("server"), { statusCode: 500 }))
      .mockResolvedValueOnce({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await push.sendToProfile(profile({ pushSubscriptions: [sub(1), sub(2), sub(3)] }), push.TEST_MESSAGE, { publicKey: "pub", privateKey: "priv" });
    expect(r).toEqual({ sent: 1, removed: 1 });
    expect(updateProfile).toHaveBeenCalledWith("s1", { pushSubscriptions: [sub(2), sub(3)] });
  });

  it("すべて届いたときはプロフィールを書き換えない", async () => {
    await push.sendToProfile(profile({}), push.TEST_MESSAGE, { publicKey: "pub", privateKey: "priv" });
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
