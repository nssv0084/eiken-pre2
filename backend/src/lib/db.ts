import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const keys = {
  item: (itemId: string) => ({ pk: `ITEM#${itemId}`, sk: "META" }),
  userProfile: (sub: string) => ({ pk: `USER#${sub}`, sk: "PROFILE" }),
  settings: () => ({ pk: "SETTINGS", sk: "GLOBAL" }),
  usageTotal: () => ({ pk: "USAGE", sk: "TOTAL" }),
};
