import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QUESTION_TYPE_LABELS, type QuestionType } from "../../../../shared/types";
import { api } from "../../api";
import { StatsView, type StatsData } from "../../components/StatsView";
import { generateTempPassword } from "../../tempPassword";
import type { StudentRow } from "./Dashboard";

interface WeakQuestion {
  questionId: string;
  type: QuestionType;
  stem: string;
  answer: string;
  attempts: number;
  correctCount: number;
  inReview: boolean;
}

interface DetailResponse {
  summary: StudentRow;
  profile: { startDate: string; examDate?: string; createdAt: string };
  enabled: boolean;
  firstLoginPending: boolean;
  stats: StatsData;
  weak: WeakQuestion[];
}

export function StudentDetail() {
  const { sub = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailResponse>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState("");
  const [examDate, setExamDate] = useState("");
  const [startDate, setStartDate] = useState("");

  const load = useCallback(() => {
    api<DetailResponse>("GET", `/admin/students/${sub}`)
      .then((d) => {
        setData(d);
        setNickname(d.summary.nickname);
        setExamDate(d.profile.examDate ?? "");
        setStartDate(d.profile.startDate);
      })
      .catch((e: Error) => setError(e.message));
  }, [sub]);

  useEffect(load, [load]);

  if (error && !data) return <p className="page error">{error}</p>;
  if (!data) return <p className="page muted">読み込み中…</p>;
  const s = data.summary;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(done);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    run(() => api("PUT", `/admin/students/${sub}`, { nickname: nickname.trim(), examDate: examDate || null, startDate }), "保存しました");
  };

  const resetPassword = () => {
    const pw = generateTempPassword();
    if (!window.confirm(`${s.nickname} さんの仮パスワードを再発行しますか？`)) return;
    run(
      () => api("POST", `/admin/students/${sub}/reset-password`, { tempPassword: pw }),
      `新しい仮パスワード: ${pw}（ログインID: ${s.username}）。生徒に伝えてください。次のログインでパスワードの変更を求められます。`,
    );
  };

  const toggleEnabled = () =>
    run(() => api("PUT", `/admin/students/${sub}`, { enabled: !data.enabled }), data.enabled ? "利用を停止しました" : "利用を再開しました");

  const remove = async () => {
    const typed = window.prompt(`${s.nickname} さんのアカウントと学習記録をすべて削除します。元に戻せません。\n確認のため、ログインID「${s.username}」を入力してください。`);
    if (typed !== s.username) return;
    setBusy(true);
    try {
      await api("DELETE", `/admin/students/${sub}`);
      navigate("/admin");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page wide stack">
      <Link to="/admin" className="small">
        ← ダッシュボード
      </Link>
      <div className="row between wrap">
        <h1 className="title">
          {s.nickname} <span className="muted small">{s.username}</span>
        </h1>
        <div className="row wrap small">
          {!data.enabled && <span className="chip chip-alert">停止中</span>}
          {data.firstLoginPending && <span className="chip">まだログインしていません</span>}
        </div>
      </div>
      {s.alerts.map((a) => (
        <p key={a} className="card warn small">
          ⚠ {a}
        </p>
      ))}
      {message && <p className="card notice">{message}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card small">
        遅れ: {s.delayDays}日 ／ 最終学習: {s.lastStudiedDate ?? "まだ"} ／ 受験日: {data.profile.examDate || "未設定"}
        {s.projection && (
          <>
            {" "}
            ／ 受験日までに {s.projection.cycle}周目の{s.projection.day}日目まで進む見込み
          </>
        )}
      </section>

      <StatsView data={data.stats} />

      <section className="card stack">
        <h2>よく間違える問題</h2>
        {data.weak.length === 0 ? (
          <p className="muted">まだありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>形式</th>
                <th>問題</th>
                <th>正解</th>
                <th>正解/解答</th>
              </tr>
            </thead>
            <tbody>
              {data.weak.map((w) => (
                <tr key={w.questionId}>
                  <td className="small">{QUESTION_TYPE_LABELS[w.type]}</td>
                  <td className="small">{w.stem.replace(/\s+/g, " ").slice(0, 90)}</td>
                  <td className="small">{w.answer}</td>
                  <td className="small">
                    {w.correctCount}/{w.attempts}
                    {w.inReview && <div className="muted">復習中</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <form className="card stack" onSubmit={save}>
        <h2>設定</h2>
        <div className="grid-2">
          <label className="field">
            <span>ニックネーム</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required />
          </label>
          <label className="field">
            <span>受験日</span>
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
          <label className="field">
            <span>カリキュラム開始日（遅れの計算に使います）</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
        </div>
        <button className="btn primary" disabled={busy}>
          保存する
        </button>
      </form>

      <section className="card stack">
        <h2>アカウント</h2>
        <div className="row wrap">
          <button className="btn" disabled={busy} onClick={resetPassword}>
            仮パスワードを再発行
          </button>
          <button className="btn" disabled={busy} onClick={toggleEnabled}>
            {data.enabled ? "利用を停止" : "利用を再開"}
          </button>
          <button className="btn danger" disabled={busy} onClick={remove}>
            削除
          </button>
        </div>
        <p className="muted small">利用を停止すると、学習記録は残したままログインできなくなります。削除するとアカウントと学習記録がすべて消えます。</p>
      </section>
    </main>
  );
}
