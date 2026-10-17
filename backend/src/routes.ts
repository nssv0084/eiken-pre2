// API Gateway のルート定義。infra はこの一覧からルートを作り、api.ts は同じキーで処理を振り分ける
export const ROUTE_KEYS = [
  "GET /me",
  "GET /admin/stock",
  "GET /admin/items",
  "POST /admin/generate",
  "GET /admin/jobs",
  "GET /admin/usage",
] as const;

export type RouteKey = (typeof ROUTE_KEYS)[number];
