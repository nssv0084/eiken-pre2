import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { getItems, getJobs, getStock, getUsage, reviewItem, startGeneration } from "./admin";
import { addAssignment, getAssignmentsForAdmin, removeAssignment } from "./admin-assignments";
import {
  addStudent,
  addTeacher,
  editStudent,
  getSettingsForAdmin,
  getStudent,
  listStudents,
  listTeachers,
  removeStudent,
  resetStudentPassword,
  saveSettings,
} from "./admin-students";
import { getCaller, requireTeacher, type Caller } from "./lib/auth";
import { HttpError, json } from "./lib/http";
import { getPushKey, sendTestPush, subscribePush, unsubscribePush } from "./push-api";
import type { RouteKey } from "./routes";
import {
  getMe,
  getMyAssignment,
  getMyAssignments,
  getMyStats,
  getPractice,
  getTodaySession,
  submitAnswer,
  submitReport,
} from "./student";

type Handler = (
  caller: Caller,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

const handlers: Record<RouteKey, Handler> = {
  "GET /me": async (caller) => json(200, await getMe(caller)),
  "GET /me/stats": async (caller) => json(200, await getMyStats(caller)),
  "GET /session": async (caller) => json(200, await getTodaySession(caller)),
  "POST /answers": async (caller, event) => json(200, await submitAnswer(caller, event)),
  "GET /practice": async (caller, event) => json(200, await getPractice(caller, event)),
  "POST /reports": async (caller, event) => json(200, await submitReport(caller, event)),
  "GET /assignments": async (caller) => json(200, await getMyAssignments(caller)),
  "GET /assignments/{id}": async (caller, event) => json(200, await getMyAssignment(caller, event)),
  "GET /push/key": async () => json(200, await getPushKey()),
  "PUT /push/subscription": async (caller, event) => json(200, await subscribePush(caller, event)),
  "DELETE /push/subscription": async (caller, event) => json(200, await unsubscribePush(caller, event)),
  "POST /push/test": async (caller) => json(200, await sendTestPush(caller)),
  "GET /admin/students": async () => json(200, await listStudents()),
  "POST /admin/students": async (_c, event) => json(201, await addStudent(event)),
  "GET /admin/students/{sub}": async (_c, event) => json(200, await getStudent(event)),
  "PUT /admin/students/{sub}": async (_c, event) => json(200, await editStudent(event)),
  "DELETE /admin/students/{sub}": async (_c, event) => json(200, await removeStudent(event)),
  "POST /admin/students/{sub}/reset-password": async (_c, event) => json(200, await resetStudentPassword(event)),
  "GET /admin/teachers": async () => json(200, await listTeachers()),
  "POST /admin/teachers": async (caller, event) => json(201, await addTeacher(caller, event)),
  "GET /admin/settings": async () => json(200, await getSettingsForAdmin()),
  "PUT /admin/settings": async (_c, event) => json(200, await saveSettings(event)),
  "GET /admin/assignments": async () => json(200, await getAssignmentsForAdmin()),
  "POST /admin/assignments": async (caller, event) => json(201, await addAssignment(caller, event)),
  "DELETE /admin/assignments/{id}": async (_c, event) => json(200, await removeAssignment(event)),
  "GET /admin/stock": async () => json(200, await getStock()),
  "GET /admin/items": async (_c, event) => json(200, await getItems(event)),
  "PUT /admin/items/{id}": async (caller, event) => json(200, await reviewItem(caller, event)),
  "POST /admin/generate": async (caller, event) => json(202, await startGeneration(caller, event)),
  "GET /admin/jobs": async () => json(200, await getJobs()),
  "GET /admin/usage": async () => json(200, await getUsage()),
};

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  try {
    const route = handlers[event.routeKey as RouteKey];
    if (!route) throw new HttpError(404, "見つかりません");
    const caller = getCaller(event);
    if (event.routeKey.split(" ")[1]?.startsWith("/admin/")) requireTeacher(caller);
    return await route(caller, event);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { message: e.message });
    console.error(e);
    return json(500, { message: "サーバーでエラーが発生しました" });
  }
}
