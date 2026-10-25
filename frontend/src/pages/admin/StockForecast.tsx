import { Link } from "react-router-dom";
import type { Forecast } from "../../../../shared/stock";
import type { ForecastKey } from "../../../../shared/stock";
import { QUESTION_TYPE_LABELS } from "../../../../shared/types";

const FORECAST_LABELS: Record<ForecastKey, string> = {
  ...QUESTION_TYPE_LABELS,
  conversation: "会話文（短い会話）",
  dialogue: "会話文（長い会話）",
};

export function StockForecastCard({ forecast, leadName }: { forecast: Forecast | null; leadName?: string }) {
  if (!forecast) {
    return (
      <section className="card stack">
        <h2>問題の在庫の見通し</h2>
        <p className="muted">生徒を追加すると表示されます。</p>
      </section>
    );
  }
  return (
    <section className="card stack">
      <div className="row between wrap">
        <h2>問題の在庫の見通し</h2>
        <Link className="btn small-btn" to="/admin/generate">
          問題を作る
        </Link>
      </div>
      <p className="muted small">
        いちばん進んでいる{leadName ? ` ${leadName} さん` : "生徒"}（{forecast.lead.cycle}周目 {forecast.lead.day}日目）を基準に、毎日1日分ずつ進めた場合の数字です。
        {forecast.upperBound && " 2周目以降は前の周の問題の再利用を見込んでいないため、実際の不足はこれより少なくなります。"}
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>形式</th>
              <th>在庫</th>
              <th>あと何日分</th>
              <th>足りない数</th>
              <th>作る数の目安</th>
            </tr>
          </thead>
          <tbody>
            {forecast.items.map((f) => (
              <tr key={f.type}>
                <td>
                  {f.warn && <span className="error">⚠ </span>}
                  {FORECAST_LABELS[f.type]}
                </td>
                <td>{f.deliverable}</td>
                <td className={f.warn ? "error" : undefined}>{f.daysLeft === null ? "周の終わりまで足りる" : `${f.daysLeft}日分`}</td>
                <td>{f.shortage || "-"}</td>
                <td>{f.suggested ? `${f.suggested}（${f.runs}回に分けて）` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
