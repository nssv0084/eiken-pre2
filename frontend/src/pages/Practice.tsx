import { useState } from "react";
import { isPassageType, QUESTION_TYPE_LABELS, QUESTION_TYPES, type PublicItem, type QuestionType, type StudyEntry } from "../../../shared/types";
import { api } from "../api";
import { Icon, TYPE_ICONS } from "../components/Icon";
import { QuestionRunner, type RunnerSummary } from "../components/QuestionRunner";
import { SetSummary } from "../components/SetSummary";

interface PracticeResponse {
  entries: StudyEntry[];
  items: Record<string, PublicItem>;
}

export function Practice({ onChanged }: { onChanged: () => void }) {
  const [type, setType] = useState<QuestionType>("vocab");
  const [count, setCount] = useState(10);
  const [data, setData] = useState<PracticeResponse>();
  const [summary, setSummary] = useState<RunnerSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const counts = isPassageType(type) ? [1, 2] : [5, 10, 20];

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api<PracticeResponse>("GET", `/practice?type=${type}&count=${count}`);
      if (res.entries.length === 0) setError("この形式の問題はまだ用意されていません");
      else setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setData(undefined);
    setSummary(undefined);
    onChanged();
  };

  if (summary) {
    return (
      <main className="page narrow stack">
        <SetSummary title="自由演習のけっか" summary={summary} />
        <button className="btn primary" onClick={reset}>
          もう一度
        </button>
      </main>
    );
  }

  if (data) {
    return (
      <main className="page narrow">
        <QuestionRunner
          title={QUESTION_TYPE_LABELS[type]}
          entries={data.entries}
          items={data.items}
          context="free"
          onFinish={setSummary}
          onQuit={reset}
        />
      </main>
    );
  }

  return (
    <main className="page narrow stack">
      <h1 className="title">自由演習</h1>
      <p className="muted small">好きな形式を選んで練習できます。カリキュラムの進み具合は変わりません。</p>
      <div className="stack-sm">
        {QUESTION_TYPES.map((t) => (
          <button
            key={t}
            className={`choice ${type === t ? "selected" : ""}`}
            onClick={() => {
              setType(t);
              setCount(isPassageType(t) ? 1 : 10);
            }}
          >
            <span className="plan-icon">
              <Icon name={TYPE_ICONS[t]} size={18} />
            </span>
            {QUESTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="row">
        {counts.map((c) => (
          <button key={c} className={`btn ${count === c ? "primary" : ""}`} onClick={() => setCount(c)}>
            {c}
            {isPassageType(type) ? "題" : "問"}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn primary btn-hero" disabled={busy} onClick={start}>
        はじめる ▶
      </button>
    </main>
  );
}
