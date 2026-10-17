import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { z } from "zod";
import { studyDate } from "../../shared/dates";
import type { Caller } from "./lib/auth";
import { createUser, deleteUser, listUsersInGroup, resetPassword, setEnabled, updateNickname } from "./lib/cognito";
import { ddb, keys, TABLE_NAME } from "./lib/db";
import { HttpError, parseBody } from "./lib/http";
import { deleteUserData, getProfile, listProfiles, newProfile, putNewProfile, updateProfile } from "./lib/profiles";
import { getSettings } from "./lib/settings";
import { statsForProfile, summarizeStudent, weakQuestions } from "./lib/study/summary";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");
const USERNAME = z.string().regex(/^[A-Za-z0-9._-]{3,32}$/, "ログインIDは3〜32文字の英数字（. _ - も可）にしてください");
const NICKNAME = z.string().trim().min(1, "ニックネームを入力してください").max(20, "ニックネームは20文字までです");
const TEMP_PASSWORD = z
  .string()
  .min(8, "仮パスワードは8文字以上にしてください")
  .regex(/\d/, "仮パスワードには数字を含めてください");

function parse<T extends z.ZodType>(schema: T, event: APIGatewayProxyEventV2WithJWTAuthorizer): z.infer<T> {
  const parsed = schema.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "入力が正しくありません");
  return parsed.data;
}

async function requireStudent(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const profile = await getProfile(event.pathParameters?.sub ?? "");
  if (!profile || profile.role !== "student") throw new HttpError(404, "生徒が見つかりません");
  return profile;
}

export async function listStudents() {
  const [profiles, users, settings] = await Promise.all([listProfiles("student"), listUsersInGroup("students"), getSettings()]);
  const today = studyDate();
  const userBySub = new Map(users.map((u) => [u.sub, u]));
  const students = profiles
    .map((p) => {
      const u = userBySub.get(p.sub);
      return {
        ...summarizeStudent(p, settings, today),
        enabled: u?.enabled ?? false,
        // FORCE_CHANGE_PASSWORD = まだ一度もログインしていない
        firstLoginPending: u?.status === "FORCE_CHANGE_PASSWORD",
      };
    })
    .sort((a, b) => b.alerts.length - a.alerts.length || a.username.localeCompare(b.username));
  return { students, inactiveAlertDays: settings.inactiveAlertDays };
}

const CreateStudent = z.object({
  username: USERNAME,
  nickname: NICKNAME,
  tempPassword: TEMP_PASSWORD,
  examDate: DATE.optional(),
  startDate: DATE.optional(),
});

export async function addStudent(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const req = parse(CreateStudent, event);
  const user = await createUser({ ...req, group: "students" });
  const profile = {
    ...newProfile({ sub: user.sub, username: user.username, nickname: req.nickname, role: "student" }, new Date(), req.startDate),
    examDate: req.examDate,
  };
  await putNewProfile(profile);
  return { student: profile };
}

export async function getStudent(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const profile = await requireStudent(event);
  const today = studyDate();
  const [settings, users, stats, weak] = await Promise.all([
    getSettings(),
    listUsersInGroup("students"),
    statsForProfile(profile, today),
    weakQuestions(profile.sub),
  ]);
  const user = users.find((u) => u.sub === profile.sub);
  return {
    summary: summarizeStudent(profile, settings, today),
    profile: { startDate: profile.startDate, examDate: profile.examDate, createdAt: profile.createdAt },
    enabled: user?.enabled ?? false,
    firstLoginPending: user?.status === "FORCE_CHANGE_PASSWORD",
    stats,
    weak,
  };
}

const UpdateStudent = z.object({
  nickname: NICKNAME.optional(),
  examDate: DATE.nullable().optional(),
  startDate: DATE.optional(),
  enabled: z.boolean().optional(),
});

export async function editStudent(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const profile = await requireStudent(event);
  const req = parse(UpdateStudent, event);
  if (req.nickname && req.nickname !== profile.nickname) await updateNickname(profile.username, req.nickname);
  if (req.enabled !== undefined) await setEnabled(profile.username, req.enabled);
  await updateProfile(profile.sub, {
    nickname: req.nickname,
    startDate: req.startDate,
    // null は受験日の取り消し。空文字は未設定と同じに扱われる
    examDate: req.examDate === null ? "" : req.examDate,
  });
  return { ok: true };
}

export async function resetStudentPassword(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const profile = await requireStudent(event);
  const { tempPassword } = parse(z.object({ tempPassword: TEMP_PASSWORD }), event);
  await resetPassword(profile.username, tempPassword);
  return { ok: true };
}

export async function removeStudent(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const profile = await requireStudent(event);
  await deleteUser(profile.username);
  const deleted = await deleteUserData(profile.sub);
  return { ok: true, deletedRows: deleted };
}

export async function listTeachers() {
  const users = await listUsersInGroup("teachers");
  return { teachers: users.map((u) => ({ username: u.username, nickname: u.nickname, enabled: u.enabled })) };
}

export async function addTeacher(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const req = parse(z.object({ username: USERNAME, nickname: NICKNAME, tempPassword: TEMP_PASSWORD }), event);
  await createUser({ ...req, group: "teachers" });
  console.log(`teacher ${req.username} added by ${caller.username}`);
  return { ok: true };
}

const SettingsRequest = z.object({
  budgetJpy: z.number().int().min(0).max(100000),
  usdJpy: z.number().min(50).max(400),
  inactiveAlertDays: z.number().int().min(1).max(30),
  stockAlertDays: z.number().int().min(1).max(60).optional(),
});

export async function getSettingsForAdmin() {
  return { settings: await getSettings() };
}

export async function saveSettings(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const req = parse(SettingsRequest, event);
  const settings = { ...(await getSettings()), ...req };
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: { ...keys.settings(), ...settings } }));
  return { settings };
}
