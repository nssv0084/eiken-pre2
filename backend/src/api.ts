import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { completedDays, getDayPlan } from "../../shared/curriculum";
import { getItems, getJobs, getStock, getUsage, reviewItem, startGeneration } from "./admin";
import { getCaller, requireTeacher, type Caller } from "./lib/auth";
import { HttpError, json } from "./lib/http";
import { getOrCreateProfile } from "./lib/profiles";
import type { RouteKey } from "./routes";

type Handler = (
  caller: Caller,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

const handlers: Record<RouteKey, Handler> = {
  "GET /me": async (caller) => {
    const profile = await getOrCreateProfile(caller);
    return json(200, {
      profile,
      today: getDayPlan(profile.grade, profile.progress.day),
      completedDays: completedDays(profile.progress),
    });
  },
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
