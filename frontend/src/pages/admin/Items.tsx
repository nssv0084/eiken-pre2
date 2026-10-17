import { useEffect, useState } from "react";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type Item, type ItemStatus, type QuestionType } from "../../../../shared/types";
import { api } from "../../api";

const STATUS_LABELS: Record<ItemStatus, string> = {
  review: "確認待ち",
  approved: "出題中",
  reported: "報告あり",
  disabled: "無効",
  pending: "検証待ち",
};

const STATUS_ORDER: ItemStatus[] = ["review", "approved", "reported", "disabled"];

const FOCUS_LABELS = { word: "単語", idiom: "熟語", grammar: "文法" } as const;

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "1 易しすぎる",
  2: "2 やや易しい",
  3: "3 標準",
  4: "4 やや難しい",
  5: "5 難しすぎる",
};

function ItemCard({ item, onChange }: { item: Item; onChange: (item: Item) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const review = async (body: { status?: "approved" | "disabled"; exemplar?: boolean }) => {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ item: Item }>("PUT", `/admin/items/${item.id}`, body);
      onChange(res.item);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card stack">
      <div className="row between wrap">
        <span className="muted small">
          {item.focus && `${FOCUS_LABELS[item.focus]} ・ `}
          {item.topic} ・ {new Date(item.createdAt).toLocaleDateString("ja-JP")}
        </span>
        <span className="row">
          {item.exemplar && <span className="badge">見本</span>}
          <span className="badge subtle">{STATUS_LABELS[item.status]}</span>
        </span>
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

      <dl className="checks small">
        {item.difficulty !== undefined && (
          <>
            <dt>AIの難しさ判定</dt>
            <dd>{DIFFICULTY_LABELS[item.difficulty] ?? item.difficulty}</dd>
          </>
        )}
        {item.level && (
          <>
            <dt>語彙レベル</dt>
            <dd className={item.level.verdict === "pass" ? undefined : "error"}>{item.level.notes.join(" / ")}</dd>
          </>
        )}
        {item.verification?.notes && (
          <>
            <dt>AI検証</dt>
            <dd className={item.verification.passed ? undefined : "error"}>{item.verification.notes}</dd>
          </>
        )}
        {item.reviewedBy && (
          <>
            <dt>講師の確認</dt>
            <dd>
              {item.reviewedBy}（{new Date(item.reviewedAt!).toLocaleDateString("ja-JP")}）
            </dd>
          </>
        )}
      </dl>

      {error && <p className="error small">{error}</p>}
      <div className="row wrap">
        {(item.status !== "approved" || !item.reviewedBy) && (
          <button className="btn primary" disabled={busy} onClick={() => review({ status: "approved" })}>
            承認する
          </button>
        )}
        {item.status === "approved" && (
          <button className="btn" disabled={busy} onClick={() => review({ exemplar: !item.exemplar })}>
            {item.exemplar ? "見本から外す" : "見本にする"}
          </button>
        )}
        {item.status !== "disabled" && (
          <button className="btn" disabled={busy} onClick={() => review({ status: "disabled" })}>
            無効にする
          </button>
        )}
      </div>
    </article>
  );
}

export function Items() {
  const [type, setType] = useState<QuestionType>("vocab");
  const [status, setStatus] = useState<ItemStatus>("review");
  const [items, setItems] = useState<Item[]>();
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(undefined);
    setError("");
    api<{ items: Item[] }>("GET", `/admin/items?type=${type}&status=${status}`)
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, [type, status]);

  const replace = (updated: Item) => setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)));

  return (
    <main className="page wide stack">
      <h1 className="title">問題一覧</h1>
      <p className="muted small">
        「見本」にした問題は、次からの問題作成で難しさの目安としてAIに渡されます。準2級らしいと思う問題を各形式で数問ずつ選んでください。
      </p>
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
      {items?.map((item) => <ItemCard key={item.id} item={item} onChange={replace} />)}
    </main>
  );
}
