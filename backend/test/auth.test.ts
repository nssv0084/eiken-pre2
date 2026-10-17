import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { getCaller } from "../src/lib/auth";
import { HttpError } from "../src/lib/http";

const eventWith = (claims: Record<string, string> | undefined) =>
  ({ requestContext: { authorizer: claims && { jwt: { claims, scopes: [] } } } }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

describe("getCaller", () => {
  it("講師グループに入っていれば teacher", () => {
    const c = getCaller(eventWith({ sub: "s1", "cognito:username": "sensei", "cognito:groups": "[teachers]" }));
    expect(c).toEqual({ sub: "s1", username: "sensei", nickname: "sensei", role: "teacher" });
  });

  it("グループなしは student、ニックネームを使う", () => {
    const c = getCaller(eventWith({ sub: "s2", "cognito:username": "taro01", nickname: "たろう" }));
    expect(c.role).toBe("student");
    expect(c.nickname).toBe("たろう");
  });

  it("認証情報がなければ401", () => {
    expect(() => getCaller(eventWith(undefined))).toThrow(HttpError);
  });
});
