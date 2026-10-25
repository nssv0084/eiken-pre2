import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

// 認可とルーティングだけを調べるので、業務ロジックは差し替える
const ok = vi.fn(async () => ({ ok: true }));
vi.mock("../src/admin", () => ({ getItems: ok, getJobs: ok, getStock: ok, getUsage: ok, reviewItem: ok, startGeneration: ok }));
vi.mock("../src/admin-assignments", () => ({ addAssignment: ok, getAssignmentsForAdmin: ok, removeAssignment: ok }));
vi.mock("../src/admin-students", () => ({
  addStudent: ok,
  addTeacher: ok,
  editStudent: ok,
  getSettingsForAdmin: ok,
  getStudent: ok,
  listStudents: ok,
  listTeachers: ok,
  removeStudent: ok,
  resetStudentPassword: ok,
  saveSettings: ok,
}));
vi.mock("../src/push-api", () => ({ getPushKey: ok, sendTestPush: ok, subscribePush: ok, unsubscribePush: ok }));
vi.mock("../src/student", () => ({
  getMe: ok,
  getMyAssignment: ok,
  getMyAssignments: ok,
  getMyStats: ok,
  getPractice: ok,
  getTodaySession: ok,
  submitAnswer: ok,
  submitReport: ok,
}));

const { handler } = await import("../src/api");
const { ROUTE_KEYS } = await import("../src/routes");

const call = (routeKey: string, claims?: Record<string, string>) =>
  handler({
    routeKey,
    requestContext: { authorizer: claims && { jwt: { claims, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer) as Promise<APIGatewayProxyStructuredResultV2>;

const student = { sub: "s1", "cognito:username": "taro", "cognito:groups": "[students]" };
const teacher = { sub: "t1", "cognito:username": "sensei", "cognito:groups": "[teachers]" };

const isAdminRoute = (key: string) => key.split(" ")[1].startsWith("/admin/");
const adminRoutes = ROUTE_KEYS.filter(isAdminRoute);
const studentRoutes = ROUTE_KEYS.filter((k) => !isAdminRoute(k));

describe("API の認可", () => {
  it("管理系と生徒系の両方の経路がある", () => {
    expect(adminRoutes.length).toBeGreaterThan(10);
    expect(studentRoutes.length).toBeGreaterThan(5);
  });

  it.each(adminRoutes)("%s [NFR-04] は生徒には403", async (key) => {
    ok.mockClear();
    const res = await call(key, student);
    expect(res.statusCode).toBe(403);
    expect(ok).not.toHaveBeenCalled();
  });

  it.each(adminRoutes)("%s は講師なら通る", async (key) => {
    expect((await call(key, teacher)).statusCode).toBeLessThan(300);
  });

  it.each(studentRoutes)("%s は生徒なら通る", async (key) => {
    expect((await call(key, student)).statusCode).toBe(200);
  });

  it.each(ROUTE_KEYS)("%s [NFR-04] は認証情報がなければ401", async (key) => {
    expect((await call(key, undefined)).statusCode).toBe(401);
  });

  it("未知の経路は404", async () => {
    expect((await call("GET /nothing", student)).statusCode).toBe(404);
  });

  it("想定外のエラーは内部の詳細を返さず500", async () => {
    ok.mockRejectedValueOnce(new Error("secret table name EikenApp-xxx"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call("GET /me", student);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("EikenApp");
  });
});
