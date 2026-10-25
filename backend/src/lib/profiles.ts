import { BatchWriteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { studyDate } from "../../../shared/dates";
import { QUESTION_TYPES, type QuestionType, type Role, type TypeStat, type UserProfile } from "../../../shared/types";
import type { Caller } from "./auth";
import { ddb, keys, TABLE_NAME } from "./db";

export async function getProfile(sub: string): Promise<UserProfile | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.userProfile(sub) }));
  return res.Item as UserProfile | undefined;
}

export async function listProfiles(role: Role): Promise<UserProfile[]> {
  const out: UserProfile[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": `USERS#${role}` },
        ExclusiveStartKey: startKey,
      }),
    );
    out.push(...((res.Items ?? []) as UserProfile[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return out;
}

// 講師が生徒を追加したときに、初回ログインを待たずにプロフィールを作る（受験日・開始日を先に設定できるように）
export async function putNewProfile(profile: UserProfile): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...keys.userProfile(profile.sub), gsi1pk: `USERS#${profile.role}`, gsi1sk: profile.username, ...profile },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

// プロフィール・解答履歴・設問ごとの状態・日別集計・課題の進み具合など、USER#{sub} の項目をすべて削除する
export async function deleteUserData(sub: string): Promise<number> {
  let deleted = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${sub}` },
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: startKey,
      }),
    );
    const rows = res.Items ?? [];
    for (let i = 0; i < rows.length; i += 25) {
      let request: Record<string, unknown[]> | undefined = {
        [TABLE_NAME]: rows.slice(i, i + 25).map((r) => ({ DeleteRequest: { Key: { pk: r.pk, sk: r.sk } } })),
      };
      while (request && Object.keys(request).length > 0) {
        const out = await ddb.send(new BatchWriteCommand({ RequestItems: request as never }));
        request = out.UnprocessedItems as typeof request;
      }
    }
    deleted += rows.length;
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return deleted;
}

const emptyStats = () =>
  Object.fromEntries(QUESTION_TYPES.map((t) => [t, { total: 0, correct: 0 }])) as Record<QuestionType, TypeStat>;

export async function updateProfile(
  sub: string,
  fields: Partial<Pick<UserProfile, "progress" | "streak" | "examDate" | "startDate" | "nickname" | "pushSubscriptions">>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.userProfile(sub),
      UpdateExpression: `SET ${entries.map((_, i) => `#k${i} = :v${i}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])),
    }),
  );
}

export function newProfile(caller: Caller, now: Date, startDate?: string): UserProfile {
  return {
    sub: caller.sub,
    username: caller.username,
    nickname: caller.nickname,
    role: caller.role,
    grade: "pre2",
    startDate: startDate ?? studyDate(now),
    progress: { cycle: 1, day: 1 },
    streak: { count: 0 },
    stats: emptyStats(),
    createdAt: now.toISOString(),
  };
}

// 講師がカリキュラム開始日を設定していなければ、初回ログイン日を開始日にする
export async function getOrCreateProfile(caller: Caller, now = new Date()): Promise<UserProfile> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.userProfile(caller.sub) }));
  if (res.Item) return res.Item as UserProfile;

  const profile = newProfile(caller, now);
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...keys.userProfile(caller.sub),
          gsi1pk: `USERS#${profile.role}`,
          gsi1sk: profile.username,
          ...profile,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return profile;
  } catch (e) {
    if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
    const again = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.userProfile(caller.sub) }));
    return again.Item as UserProfile;
  }
}
