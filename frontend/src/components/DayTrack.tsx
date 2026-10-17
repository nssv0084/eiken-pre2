import { CURRICULUM_DAYS } from "../../../shared/curriculum";

// 30日のすごろく。終わった日・今日・模試の日（30日目）を色分けする
export function DayTrack({ day, completedToday }: { day: number; completedToday: boolean }) {
  // 今日の分を終えると day は翌日になっている。30日目を終えた直後（次の周の1日目）は30日すべてを完了として見せる
  const doneUntil = completedToday && day === 1 ? CURRICULUM_DAYS : day - 1;
  const today = completedToday ? 0 : day;
  return (
    <div className="day-track" aria-label={`${CURRICULUM_DAYS}日中${doneUntil}日完了`}>
      {Array.from({ length: CURRICULUM_DAYS }, (_, i) => {
        const d = i + 1;
        const cls = d <= doneUntil ? "done" : d === today ? "today" : "";
        return (
          <span key={d} className={`day-dot ${cls} ${d === CURRICULUM_DAYS ? "mock" : ""}`}>
            {d === CURRICULUM_DAYS ? "模" : d}
          </span>
        );
      })}
    </div>
  );
}
