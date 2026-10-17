import type { RunnerSummary } from "./QuestionRunner";

export function SetSummary({ title, summary }: { title: string; summary: RunnerSummary }) {
  const rate = summary.total === 0 ? 0 : Math.round((summary.correct / summary.total) * 100);
  return (
    <section className="card stack">
      <h2>{title}</h2>
      <p className="big-score">
        {summary.correct} / {summary.total} 問正解 <span className="muted">（{rate}%）</span>
      </p>
      {summary.wrong.length > 0 && (
        <div className="stack-sm">
          <p className="muted small">間違えた問題（明日以降の復習に出ます）</p>
          <ul className="wrong-list">
            {summary.wrong.map(({ question, answerIndex }) => (
              <li key={question.id}>
                <span className="stem small">{question.stem.replace(/\s+/g, " ").slice(0, 80)}</span>
                <br />
                <span className="small">正解: {question.choices[answerIndex]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
