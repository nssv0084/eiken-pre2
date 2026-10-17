import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type CurriculumProgress, type DailyStat, type QuestionType, type TypeStat } from "../../../shared/types";

export interface StatsData {
  stats: Record<QuestionType, TypeStat>;
  cycles: { cycle: number; stats: Record<QuestionType, TypeStat> }[];
  daily: DailyStat[];
  reviewQueue: number;
  streak: number;
  progress: CurriculumProgress;
}

const rate = (s?: TypeStat) => (s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : undefined);

export function StatsView({ data }: { data: StatsData }) {
  const days = data.daily.slice(-14);
  const maxDay = Math.max(10, ...days.map((d) => d.total));
  const total = QUESTION_TYPES.reduce((n, t) => n + (data.stats[t]?.total ?? 0), 0);

  return (
    <>
      <section className="card row between wrap">
        <div>
          <div className="muted small">連続学習</div>
          <strong className="big-score">{data.streak}日</strong>
        </div>
        <div>
          <div className="muted small">進み具合</div>
          <strong>
            {data.progress.cycle}周目 {data.progress.day}日目
          </strong>
        </div>
        <div>
          <div className="muted small">解いた問題</div>
          <strong>{total}問</strong>
        </div>
        <div>
          <div className="muted small">復習待ち</div>
          <strong>{data.reviewQueue}問</strong>
        </div>
      </section>

      <section className="card stack">
        <h2>形式ごとの正答率</h2>
        {QUESTION_TYPES.map((t) => {
          const s = data.stats[t];
          const r = rate(s);
          return (
            <div key={t} className="stack-sm">
              <div className="row between small">
                <span>{QUESTION_TYPE_LABELS[t]}</span>
                <span className="muted">{r === undefined ? "まだ解いていません" : `${r}%（${s.correct}/${s.total}）`}</span>
              </div>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${r ?? 0}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <h2>この2週間</h2>
        <div className="bars" role="img" aria-label="日ごとの解答数">
          {days.map((d) => (
            <div key={d.date} className="bar-col" title={`${d.date}: ${d.total}問中${d.correct}問正解`}>
              <div className="bar" style={{ height: `${(d.total / maxDay) * 100}%` }}>
                <div className="bar-correct" style={{ height: d.total ? `${(d.correct / d.total) * 100}%` : 0 }} />
              </div>
              <span className="bar-label">{Number(d.date.slice(8))}</span>
            </div>
          ))}
        </div>
        <p className="muted small">棒の高さが解いた問題数、濃い部分が正解した数です。</p>
      </section>

      {data.cycles.length > 0 && (
        <section className="card stack">
          <h2>周回ごとの正答率</h2>
          <table className="table">
            <thead>
              <tr>
                <th>形式</th>
                {data.cycles.map((c) => (
                  <th key={c.cycle}>{c.cycle}周目</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUESTION_TYPES.map((t) => (
                <tr key={t}>
                  <td>{QUESTION_TYPE_LABELS[t]}</td>
                  {data.cycles.map((c) => {
                    const r = rate(c.stats[t]);
                    return <td key={c.cycle}>{r === undefined ? "-" : `${r}%`}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
