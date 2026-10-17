import { useCallback, useEffect, useState, type FormEvent } from "react";
import { addDays } from "../../../../shared/dates";
import {
  isPassageType,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type Assignment,
  type AssignmentProgress,
  type QuestionType,
} from "../../../../shared/types";
import { api } from "../../api";

type AssignmentRow = Omit<Assignment, "entries"> & { progress: (AssignmentProgress & { nickname: string })[] };
interface ListResponse {
  assignments: AssignmentRow[];
  students: { sub: string; nickname: string; username: string }[];
}

const todayLocal = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function CreateForm({ students, onCreated }: { students: ListResponse["students"]; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<QuestionType>("vocab");
  const [count, setCount] = useState(10);
  const [dueDate, setDueDate] = useState(addDays(todayLocal(), 7));
  const [all, setAll] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/admin/assignments", { title: title.trim(), type, count, dueDate, targets: all ? "all" : targets });
      setTitle("");
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const passage = isPassageType(type);
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>課題を配る</h2>
      <div className="grid-2">
        <label className="field">
          <span>課題名</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 今週の会話文" maxLength={40} required />
        </label>
        <label className="field">
          <span>形式</span>
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as QuestionType;
              setType(t);
              setCount(isPassageType(t) ? 2 : 10);
            }}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{passage ? "題数（1〜5題）" : "問題数（1〜30問）"}</span>
          <input type="number" min={1} max={passage ? 5 : 30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>期限</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </label>
      </div>
      <div className="stack-sm">
        <label className="radio">
          <input type="radio" checked={all} onChange={() => setAll(true)} />
          生徒全員（{students.length}人）
        </label>
        <label className="radio">
          <input type="radio" checked={!all} onChange={() => setAll(false)} />
          生徒を選ぶ
        </label>
        {!all && (
          <div className="row wrap">
            {students.map((s) => (
              <label key={s.sub} className="radio chip">
                <input
                  type="checkbox"
                  checked={targets.includes(s.sub)}
                  onChange={(e) => setTargets(e.target.checked ? [...targets, s.sub] : targets.filter((t) => t !== s.sub))}
                />
                {s.nickname}
              </label>
            ))}
          </div>
        )}
      </div>
      <p className="muted small">対象の生徒全員に同じ問題が出ます。生徒のホーム画面で、今日の学習より上に表示されます。</p>
      {error && <p className="error small">{error}</p>}
      <button className="btn primary" disabled={busy || students.length === 0}>
        配る
      </button>
    </form>
  );
}

export function Assignments() {
  const [data, setData] = useState<ListResponse>();
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<ListResponse>("GET", "/admin/assignments")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <p className="page error">{error}</p>;
  if (!data) return <p className="page muted">読み込み中…</p>;

  const remove = async (a: AssignmentRow) => {
    if (!window.confirm(`課題「${a.title}」を削除しますか？生徒の進み具合も消えます（学習記録は残ります）。`)) return;
    try {
      await api("DELETE", `/admin/assignments/${a.id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const today = todayLocal();
  return (
    <main className="page wide stack">
      <h1 className="title">課題</h1>
      <CreateForm students={data.students} onCreated={load} />

      {data.assignments.length === 0 && <p className="muted">まだ課題はありません</p>}
      {data.assignments.map((a) => {
        const done = a.progress.filter((p) => p.completedAt).length;
        return (
          <section key={a.id} className="card stack">
            <div className="row between wrap">
              <div>
                <h2>{a.title}</h2>
                <span className="muted small">
                  {QUESTION_TYPE_LABELS[a.type]} {a.questionCount}問 ／ 期限 {a.dueDate}
                  {a.dueDate < today && "（期限切れ）"} ／ 完了 {done}/{a.progress.length}人
                </span>
              </div>
              <button className="btn small-btn" onClick={() => remove(a)}>
                削除
              </button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>生徒</th>
                  <th>進み具合</th>
                  <th>正答率</th>
                </tr>
              </thead>
              <tbody>
                {a.progress.map((p) => (
                  <tr key={p.sub}>
                    <td>{p.nickname}</td>
                    <td>{p.completedAt ? "完了" : `${p.answered} / ${a.questionCount}`}</td>
                    <td>{p.answered ? `${Math.round((p.correct / p.answered) * 100)}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
