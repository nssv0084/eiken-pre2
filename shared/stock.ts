import { CURRICULUM_DAYS, completedDays, getDayPlan } from "./curriculum";
import { QUESTION_TYPES, type CurriculumProgress, type Grade, type ItemStatus, type QuestionType } from "./types";

// 1回の生成ジョブで作れる上限（Lambda の15分以内に収まる量）
export const MAX_PER_JOB: Record<QuestionType, number> = { vocab: 30, conversation: 15, cloze: 5, reading: 5 };

// 出題前の無効化や報告で減る分の余裕
const BUFFER_PERCENT = 10;

export interface TypeForecast {
  type: QuestionType;
  deliverable: number;
  // 毎日1日分ずつ進めたとき、在庫で足りる日数。現在の周の終わりまで足りるなら null
  daysLeft: number | null;
  // 現在の周の終わりまでに足りない数
  shortage: number;
  suggested: number;
  runs: number;
  warn: boolean;
}

export interface Forecast {
  lead: CurriculumProgress;
  // 2周目以降は前の周の問題の再利用を見込まない（実際の不足はこれより少ない）
  upperBound: boolean;
  items: TypeForecast[];
}

export const deliverableCount = (counts: Partial<Record<ItemStatus, number>>): number => counts.approved ?? 0;

// 通算の日数（0始まり）の1日分で、形式ごとに必要な数。復習は在庫を使わないので含めない
function dayDemand(grade: Grade, dayIndex: number): Record<QuestionType, number> {
  const demand = { vocab: 0, conversation: 0, cloze: 0, reading: 0 };
  for (const slot of getDayPlan(grade, (dayIndex % CURRICULUM_DAYS) + 1).slots) demand[slot.type] += slot.count;
  return demand;
}

export function buildForecast(params: {
  grade: Grade;
  deliverable: Record<QuestionType, number>;
  progresses: CurriculumProgress[];
  alertDays: number;
}): Forecast | null {
  const { grade, deliverable, progresses, alertDays } = params;
  if (progresses.length === 0) return null;

  const lead = progresses.reduce((a, b) => (completedDays(b) > completedDays(a) ? b : a));
  const done = completedDays(lead);
  const cycleEnd = lead.cycle * CURRICULUM_DAYS;

  const items = QUESTION_TYPES.map((type): TypeForecast => {
    let used = 0;
    for (let d = 0; d < done; d++) used += dayDemand(grade, d)[type];
    const remaining = Math.max(0, deliverable[type] - used);

    let cumulative = 0;
    let firstShortDay: number | undefined;
    for (let d = done; d < cycleEnd; d++) {
      cumulative += dayDemand(grade, d)[type];
      if (firstShortDay === undefined && cumulative > remaining) firstShortDay = d;
    }
    const shortage = Math.max(0, cumulative - remaining);
    const suggested = shortage === 0 ? 0 : Math.ceil((shortage * (100 + BUFFER_PERCENT)) / 100);
    const daysLeft = firstShortDay === undefined ? null : firstShortDay - done;
    return {
      type,
      deliverable: deliverable[type],
      daysLeft,
      shortage,
      suggested,
      runs: Math.ceil(suggested / MAX_PER_JOB[type]),
      warn: daysLeft !== null && daysLeft < alertDays,
    };
  });

  return { lead, upperBound: lead.cycle >= 2, items };
}
