import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { z } from "zod";
import { isPassageType, QUESTION_TYPES, type Assignment } from "../../shared/types";
import {
  createAssignment,
  deleteAssignment,
  getAssignment,
  getProgresses,
  listAssignments,
  summarizeProgress,
} from "./lib/assignments";
import type { Caller } from "./lib/auth";
import { HttpError, parseBody } from "./lib/http";
import { listProfiles } from "./lib/profiles";
import { selectItems } from "./lib/study/select";
import { listDeliverableItems } from "./lib/study/store";

const CreateAssignment = z.object({
  title: z.string().trim().min(1, "課題名を入力してください").max(40),
  type: z.enum(QUESTION_TYPES),
  count: z.number().int().min(1).max(30),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "期限を入力してください"),
  targets: z.union([z.literal("all"), z.array(z.string()).min(1, "対象の生徒を選んでください")]),
});

export async function addAssignment(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const parsed = CreateAssignment.safeParse(parseBody(event.body, event.isBase64Encoded));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const req = parsed.data;

  const students = await listProfiles("student");
  const validSubs = new Set(students.map((s) => s.sub));
  const targets = req.targets === "all" ? [...validSubs] : req.targets.filter((s) => validSubs.has(s));
  if (targets.length === 0) throw new HttpError(400, "対象の生徒がいません");

  // 全員に同じ問題を出す（講師が正答率を比べられるように）。長文は count を題数として扱う
  const pool = await listDeliverableItems("pre2", req.type);
  const itemCount = isPassageType(req.type) ? Math.min(req.count, 5) : req.count;
  const chosen = selectItems({ items: pool, states: new Map(), cycle: 1, count: itemCount });
  if (chosen.length === 0) throw new HttpError(409, "この形式の問題がまだありません");

  const entries = chosen.map((i) => ({ itemId: i.id, questionIds: i.questions.map((q) => q.id) }));
  const assignment: Assignment = {
    id: randomUUID(),
    title: req.title,
    type: req.type,
    entries,
    questionCount: entries.reduce((n, e) => n + e.questionIds.length, 0),
    dueDate: req.dueDate,
    targets,
    createdBy: caller.username,
    createdAt: new Date().toISOString(),
  };
  await createAssignment(assignment);
  return { assignment };
}

export async function getAssignmentsForAdmin() {
  const [assignments, students] = await Promise.all([listAssignments(), listProfiles("student")]);
  const nickname = new Map(students.map((s) => [s.sub, s.nickname]));
  const progress = await getProgresses(assignments.flatMap((a) => a.targets.map((sub) => ({ sub, id: a.id }))));
  return {
    assignments: assignments.map((a) => ({
      ...a,
      entries: undefined,
      progress: a.targets.map((sub) => ({
        ...summarizeProgress(sub, progress.get(`${sub}|${a.id}`)),
        nickname: nickname.get(sub) ?? "（削除された生徒）",
      })),
    })),
    students: students.map((s) => ({ sub: s.sub, nickname: s.nickname, username: s.username })),
  };
}

export async function removeAssignment(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const a = await getAssignment(event.pathParameters?.id ?? "");
  if (!a) throw new HttpError(404, "課題が見つかりません");
  await deleteAssignment(a);
  return { ok: true };
}
