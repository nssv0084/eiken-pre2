import { addDays } from "../../../../shared/dates";
import type { Streak } from "../../../../shared/types";

// その日を「学習した日」として連続日数を更新する
export function markStudied(streak: Streak, today: string): Streak {
  if (streak.lastDate === today) return streak;
  const continued = streak.lastDate === addDays(today, -1);
  return { count: continued ? streak.count + 1 : 1, lastDate: today };
}

// 表示用の連続日数。前日も今日も学習していなければ途切れている
export function currentStreak(streak: Streak, today: string): number {
  if (!streak.lastDate) return 0;
  return streak.lastDate === today || streak.lastDate === addDays(today, -1) ? streak.count : 0;
}

// 「学習した日」の条件: その日のカリキュラムを完了、または10問以上解答
export const STUDIED_DAY_MIN_ANSWERS = 10;
