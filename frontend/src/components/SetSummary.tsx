import { useState } from "react";
import type { RunnerSummary } from "./QuestionRunner";
import { ScoreRing } from "./ScoreRing";

const WRONG_PREVIEW = 5;

function cheer(rate: number): string {
  if (rate === 1) return "パーフェクト！すばらしい！";
  if (rate >= 0.8) return "よくできました！";
  if (rate >= 0.6) return "いい調子！間違えた問題は復習で取り返そう";
  return "おつかれさま！間違えた問題は明日の復習に出ます";
}

export function SetSummary({ title, summary }: { title: string; summary: RunnerSummary }) {
  const rate = summary.total === 0 ? 0 : summary.correct / summary.total;
  const [showAll, setShowAll] = useState(false);
  const wrong = showAll ? summary.wrong : summary.wrong.slice(0, WRONG_PREVIEW);
  return (
    <section className="card stack celebrate">
      <h2>{title}</h2>
      <ScoreRing correct={summary.correct} total={summary.total} />
      <strong>{cheer(rate)}</strong>
      {summary.wrong.length > 0 && (
        <div className="stack-sm" style={{ textAlign: "left" }}>
          <p className="muted small" style={{ margin: 0 }}>
            間違えた問題 {summary.wrong.length}問（明日以降の復習に出ます）
          </p>
          <ul className="wrong-list">
            {wrong.map(({ question, answerIndex }) => (
              <li key={question.id}>
                <span className="small">{question.stem.replace(/\s+/g, " ").slice(0, 80)}</span>
                <br />
                <strong className="small">正解: {question.choices[answerIndex]}</strong>
              </li>
            ))}
          </ul>
          {summary.wrong.length > WRONG_PREVIEW && (
            <button className="btn small-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? "閉じる" : `すべて見る（あと${summary.wrong.length - WRONG_PREVIEW}問）`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
