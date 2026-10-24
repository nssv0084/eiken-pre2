import { listUsersInGroup } from "./lib/cognito";
import { listProfiles } from "./lib/profiles";
import { sendReminders } from "./lib/push";

// EventBridge から毎日20時（日本時間）に起動される
export async function handler() {
  const [profiles, users] = await Promise.all([listProfiles("student"), listUsersInGroup("students")]);
  const result = await sendReminders(profiles, users);
  console.log(JSON.stringify({ reminder: result }));
  return result;
}
