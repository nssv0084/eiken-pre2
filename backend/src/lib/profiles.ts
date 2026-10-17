import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { studyDate } from "../../../shared/dates";
import { QUESTION_TYPES, type QuestionType, type TypeStat, type UserProfile } from "../../../shared/types";
import type { Caller } from "./auth";
import { ddb, keys, TABLE_NAME } from "./db";

const emptyStats = () =>
  Object.fromEntries(QUESTION_TYPES.map((t) => [t, { total: 0, correct: 0 }])) as Record<QuestionType, TypeStat>;

export function newProfile(caller: Caller, now: Date): UserProfile {
  return {
    sub: caller.sub,
    username: caller.username,
    nickname: caller.nickname,
    role: caller.role,
    grade: "pre2",
    startDate: studyDate(now),
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
