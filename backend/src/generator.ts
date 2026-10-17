import { runJob } from "./lib/generation/run-job";

// API の Lambda から非同期（Event）で起動される。API Gateway の30秒制限を受けない
export async function handler(event: { jobId: string }): Promise<void> {
  await runJob(event.jobId);
}
