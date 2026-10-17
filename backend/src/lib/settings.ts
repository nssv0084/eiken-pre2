import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_SETTINGS, type Settings } from "../../../shared/types";
import { ddb, keys, TABLE_NAME } from "./db";

export async function getSettings(): Promise<Settings> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.settings() }));
  return { ...DEFAULT_SETTINGS, ...(res.Item as Partial<Settings> | undefined) };
}
