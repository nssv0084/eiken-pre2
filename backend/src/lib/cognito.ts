import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { HttpError } from "./http";

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID ?? "";

export interface CognitoUser {
  username: string;
  sub: string;
  nickname: string;
  status: string;
  enabled: boolean;
  createdAt?: string;
}

const attr = (u: UserType, name: string) => u.Attributes?.find((a) => a.Name === name)?.Value ?? "";

function toUser(u: UserType): CognitoUser {
  return {
    username: u.Username ?? "",
    sub: attr(u, "sub"),
    nickname: attr(u, "nickname"),
    status: u.UserStatus ?? "",
    enabled: u.Enabled ?? true,
    createdAt: u.UserCreateDate?.toISOString(),
  };
}

// Cognito のエラーを講師にわかる日本語にする
function translate(e: unknown): never {
  const name = (e as Error).name;
  if (name === "UsernameExistsException") throw new HttpError(409, "そのログインIDはすでに使われています");
  if (name === "InvalidPasswordException") throw new HttpError(400, "パスワードは8文字以上で、数字を含めてください");
  if (name === "UserNotFoundException") throw new HttpError(404, "ユーザーが見つかりません");
  if (name === "InvalidParameterException") throw new HttpError(400, "入力が正しくありません（ログインIDは英数字で入力してください）");
  throw e;
}

export async function createUser(p: {
  username: string;
  nickname: string;
  tempPassword: string;
  group: "students" | "teachers";
}): Promise<CognitoUser> {
  try {
    const res = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: p.username,
        TemporaryPassword: p.tempPassword,
        MessageAction: "SUPPRESS",
        UserAttributes: [{ Name: "nickname", Value: p.nickname }],
      }),
    );
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: USER_POOL_ID, Username: p.username, GroupName: p.group }));
    return toUser(res.User!);
  } catch (e) {
    translate(e);
  }
}

export async function listUsersInGroup(group: "students" | "teachers"): Promise<CognitoUser[]> {
  const users: CognitoUser[] = [];
  let token: string | undefined;
  do {
    const res = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: group, NextToken: token }));
    users.push(...(res.Users ?? []).map(toUser));
    token = res.NextToken;
  } while (token);
  return users;
}

export async function resetPassword(username: string, tempPassword: string): Promise<void> {
  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: username, Password: tempPassword, Permanent: false }),
    );
  } catch (e) {
    translate(e);
  }
}

export async function setEnabled(username: string, enabled: boolean): Promise<void> {
  const Command = enabled ? AdminEnableUserCommand : AdminDisableUserCommand;
  try {
    await cognito.send(new Command({ UserPoolId: USER_POOL_ID, Username: username }));
  } catch (e) {
    translate(e);
  }
}

export async function updateNickname(username: string, nickname: string): Promise<void> {
  try {
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [{ Name: "nickname", Value: nickname }],
      }),
    );
  } catch (e) {
    translate(e);
  }
}

export async function deleteUser(username: string): Promise<void> {
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  } catch (e) {
    if ((e as Error).name !== "UserNotFoundException") translate(e);
  }
}
