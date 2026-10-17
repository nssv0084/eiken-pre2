const DAY_MS = 24 * 60 * 60 * 1000;
// 学習日は日本時間の午前3時で切り替える（UTC+9 から3時間戻す = UTC+6）
const STUDY_DAY_OFFSET_MS = 6 * 60 * 60 * 1000;

export function studyDate(now: Date = new Date()): string {
  return new Date(now.getTime() + STUDY_DAY_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
