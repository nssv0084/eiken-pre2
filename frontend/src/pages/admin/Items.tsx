import { useEffect, useState } from "react";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type Item, type ItemStatus, type QuestionType } from "../../../../shared/types";
import { api } from "../../api";

const STATUS_LABELS: Record<ItemStatus, string> = {
  approved: "出題中",
  review: "確認待ち（出題中）",
  reported: "報告あり",
  disabled: "無効",
  pending: "検証待ち",
};

const STATUS_ORDER: ItemStatus[] = ["approved", "review", "reported", "disabled"];

function ItemCard({ item }: { item: Item }) {
  return (
    <article className="card stack">
      <div className="row between">
        <span className="muted small">
          {item.topic} ・ {new Date(item.createdAt).toLocaleDateString("ja-JP")}
        </span>
        <span className="badge subtle">{STATUS_LABELS[item.status]}</span>
      </div>
      {item.title && <h3 className="item-title">{item.title}</h3>}
      {item.passage && (
        <details>
          <summary>本文を表示</summary>
          <p className="passage">{item.passage}</p>
        </details>
      )}
      {item.questions.map((q, i) => (
        <div key={q.id} className="stack-sm">
          <p className="stem">
            {item.questions.length > 1 && <strong>設問{i + 1}　</strong>}
            {q.stem}
          </p>
          <ol className="choices">
            {q.choices.map((c, j) => (
              <li key={j} className={j === q.answerIndex ? "correct" : undefined}>
                {c}
              </li>
            ))}
          </ol>
          <p className="explanation">{q.explanation}</p>
        </div>
      ))}
      {item.verification?.notes && (
        <p className={`small ${item.verification.passed ? "muted" : "error"}`}>AI 検証: {item.verification.notes}</p>
      )}
    </article>
  );
}

export function Items() {
  const [type, setType] = useState<QuestionType>("vocab");
  const [status, setStatus] = useState<ItemStatus>("approved");
  const [items, setItems] = useState<Item[]>();
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(undefined);
    setError("");
    api<{ items: Item[] }>("GET", `/admin/items?type=${type}&status=${status}`)
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, [type, status]);

  return (
    <main className="page wide stack">
      <h1 className="title">問題一覧</h1>
      <div className="row wrap">
        <select value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="muted small">新しい順に最大50件</span>
      </div>
      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="muted">読み込み中…</p>}
      {items?.length === 0 && <p className="muted">該当する問題はありません</p>}
      {items?.map((item) => <ItemCard key={item.id} item={item} />)}
    </main>
  );
}
