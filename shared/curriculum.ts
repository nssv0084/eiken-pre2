import { daysBetween } from "./dates";
import type { CurriculumProgress, Grade, PassageGenre, QuestionType } from "./types";

export const CURRICULUM_DAYS = 30;
export const REVIEW_MAX = 8;

// count は語彙・短い会話なら設問数、長文型と長い会話（genre: dialogue）なら題数
export interface Slot {
  type: QuestionType;
  count: number;
  genre?: PassageGenre;
}

export interface DayPlan {
  day: number;
  phase: string;
  slots: Slot[];
  reviewMax: number;
  isMock: boolean;
}

const readingGenre = (day: number): PassageGenre => (day % 2 === 1 ? "email" : "explanation");

function pre2DayPlan(day: number): DayPlan {
  if (day <= 10) {
    return {
      day,
      phase: "語彙・会話の基礎",
      slots: [
        { type: "vocab", count: 15 },
        { type: "conversation", count: 3 },
        { type: "conversation", count: 1, genre: "dialogue" },
      ],
      reviewMax: REVIEW_MAX,
      isMock: false,
    };
  }
  if (day <= 18) {
    return {
      day,
      phase: "長文の語句空所補充",
      slots: [
        { type: "cloze", count: 1 },
        { type: "vocab", count: 10 },
        { type: "conversation", count: 2 },
      ],
      reviewMax: REVIEW_MAX,
      isMock: false,
    };
  }
  if (day <= 26) {
    return {
      day,
      phase: "長文の内容一致",
      slots: [
        { type: "reading", count: 1, genre: readingGenre(day) },
        { type: "vocab", count: 8 },
      ],
      reviewMax: REVIEW_MAX,
      isMock: false,
    };
  }
  if (day <= 29) {
    return {
      day,
      phase: "総合演習",
      slots: [
        { type: "vocab", count: 10 },
        { type: "conversation", count: 1 },
        { type: "conversation", count: 1, genre: "dialogue" },
        { type: "cloze", count: 1 },
        { type: "reading", count: 1, genre: readingGenre(day) },
      ],
      reviewMax: REVIEW_MAX,
      isMock: false,
    };
  }
  return {
    day,
    phase: "模試と振り返り",
    slots: [
      { type: "vocab", count: 15 },
      { type: "conversation", count: 3 },
      { type: "conversation", count: 1, genre: "dialogue" },
      { type: "cloze", count: 1 },
      { type: "reading", count: 1, genre: "email" },
      { type: "reading", count: 1, genre: "explanation" },
    ],
    reviewMax: 0,
    isMock: true,
  };
}

const PLANS: Record<Grade, (day: number) => DayPlan> = {
  pre2: pre2DayPlan,
};

export function getDayPlan(grade: Grade, day: number): DayPlan {
  if (!Number.isInteger(day) || day < 1 || day > CURRICULUM_DAYS) {
    throw new RangeError(`day must be 1..${CURRICULUM_DAYS}: ${day}`);
  }
  return PLANS[grade](day);
}

export function completedDays(progress: CurriculumProgress): number {
  return (progress.cycle - 1) * CURRICULUM_DAYS + (progress.day - 1);
}

export function toProgress(completed: number): { cycle: number; day: number } {
  return {
    cycle: Math.floor(completed / CURRICULUM_DAYS) + 1,
    day: (completed % CURRICULUM_DAYS) + 1,
  };
}

export function nextProgress(progress: CurriculumProgress): { cycle: number; day: number } {
  return toProgress(completedDays(progress) + 1);
}

// 開始日からの経過日数に対する実際の進度の遅れ（日数）。先取りはできないので0以上
export function delayDays(progress: CurriculumProgress, startDate: string, today: string): number {
  return Math.max(0, daysBetween(startDate, today) - completedDays(progress));
}

export interface Projection {
  cycle: number;
  day: number;
  daysLeft: number;
  reachesTwoCycles: boolean;
}

// これまでのペース（完了日数 / 経過日数）が続いた場合に、受験日の前日までにどこまで進むか
export function projectProgress(
  progress: CurriculumProgress,
  startDate: string,
  today: string,
  examDate: string,
): Projection {
  const daysLeft = Math.max(0, daysBetween(today, examDate));
  const done = completedDays(progress);
  const elapsed = daysBetween(startDate, today);
  const pace = elapsed <= 0 ? 1 : Math.min(1, done / elapsed);
  const projected = done + Math.floor(daysLeft * pace);
  return {
    ...toProgress(projected),
    daysLeft,
    reachesTwoCycles: projected >= CURRICULUM_DAYS * 2,
  };
}
