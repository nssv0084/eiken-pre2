import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { GenerateJob } from "../../../shared/types";
import { ddb, TABLE_NAME } from "./db";

export type { GenerateJob };

const jobKey = (id: string) => ({ pk: `JOB#${id}`, sk: "META" });

export async function createJob(job: GenerateJob): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...jobKey(job.id), gsi1pk: "JOBS", gsi1sk: job.createdAt, ...job },
    }),
  );
}

export async function getJob(id: string): Promise<GenerateJob | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: jobKey(id) }));
  return res.Item as GenerateJob | undefined;
}

export async function updateJob(
  id: string,
  fields: Partial<Pick<GenerateJob, "status" | "approved" | "review" | "rejected" | "usd" | "error">>,
): Promise<void> {
  const entries = Object.entries({ ...fields, updatedAt: new Date().toISOString() });
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: jobKey(id),
      UpdateExpression: `SET ${entries.map((_, i) => `#k${i} = :v${i}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])),
    }),
  );
}

export async function listJobs(limit = 20): Promise<GenerateJob[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": "JOBS" },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []) as GenerateJob[];
}
