import { addDays } from "../../../../shared/dates";
import type { QuestionType } from "../../../../shared/types";

// 設問ごとの生徒の状態（USER#{sub} / QS#{questionId}）
export interface QuestionState {
  questionId: string;
  itemId: string;
  type: QuestionType;
  attempts: number;
  correctCount: number;
  correctStreak: number;
  lastResult: boolean;
  lastAnsweredAt: string;
  lastCycle: number;
  // 間違えたことのある周回
  wrongCycles: number[];
  // 復習の予定日。復習の対象でなければ undefined
  nextReviewDate?: string;
}

// 間違えたら翌日、復習で正解したら3日後にもう一度。2回続けて正解したら復習から外す
export const REVIEW_INTERVALS_DAYS = [1, 3];
export const REVIEW_GRADUATE_STREAK = 2;

export function nextQuestionState(
  prev: QuestionState | undefined,
  input: { questionId: string; itemId: string; type: QuestionType; correct: boolean; today: string; cycle: number; now: string },
): QuestionState {
  const base: QuestionState = prev ?? {
    questionId: input.questionId,
    itemId: input.itemId,
    type: input.type,
    attempts: 0,
    correctCount: 0,
    correctStreak: 0,
    lastResult: false,
    lastAnsweredAt: input.now,
    lastCycle: input.cycle,
    wrongCycles: [],
  };
  const state: QuestionState = {
    ...base,
    attempts: base.attempts + 1,
    lastResult: input.correct,
    lastAnsweredAt: input.now,
    lastCycle: input.cycle,
  };

  if (!input.correct) {
    return {
      ...state,
      correctStreak: 0,
      wrongCycles: base.wrongCycles.includes(input.cycle) ? base.wrongCycles : [...base.wrongCycles, input.cycle],
      nextReviewDate: addDays(input.today, REVIEW_INTERVALS_DAYS[0]),
    };
  }

  const streak = base.correctStreak + 1;
  const inReview = base.nextReviewDate !== undefined;
  return {
    ...state,
    correctCount: base.correctCount + 1,
    correctStreak: streak,
    nextReviewDate:
      inReview && streak < REVIEW_GRADUATE_STREAK
        ? addDays(input.today, REVIEW_INTERVALS_DAYS[Math.min(streak, REVIEW_INTERVALS_DAYS.length - 1)])
        : undefined,
  };
}
