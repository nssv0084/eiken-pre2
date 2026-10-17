import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { completedDays, getDayPlan } from "../../shared/curriculum";
import { getCaller, type Caller } from "./lib/auth";
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
};

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  try {
    const route = handlers[event.routeKey as RouteKey];
    if (!route) throw new HttpError(404, "見つかりません");
    return await route(getCaller(event), event);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { message: e.message });
    console.error(e);
    return json(500, { message: "サーバーでエラーが発生しました" });
  }
}
