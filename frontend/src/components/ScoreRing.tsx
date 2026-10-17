import { useEffect, useState } from "react";

const R = 56;
const C = 2 * Math.PI * R;

export function ScoreRing({ correct, total }: { correct: number; total: number }) {
  const rate = total === 0 ? 0 : correct / total;
  // 0 から伸びるアニメーションにするため、描画後に値を入れる
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(rate), 50);
    return () => clearTimeout(t);
  }, [rate]);

  return (
    <div className="score-ring">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle className="ring-bg" cx="66" cy="66" r={R} fill="none" strokeWidth="12" />
        <circle
          className="ring-fg"
          cx="66"
          cy="66"
          r={R}
          fill="none"
          strokeWidth="12"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown)}
        />
      </svg>
      <div className="ring-text">
        <strong>{Math.round(rate * 100)}%</strong>
        <span className="muted small">
          {correct} / {total} 問
        </span>
      </div>
    </div>
  );
}
