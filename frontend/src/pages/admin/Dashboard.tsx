import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Projection } from "../../../../shared/curriculum";
import type { Forecast } from "../../../../shared/stock";
import type { CurriculumProgress, ItemStatus, QuestionType, UsageSummary } from "../../../../shared/types";
import { api } from "../../api";
import { generateTempPassword } from "../../tempPassword";
import { StockForecastCard } from "./StockForecast";

export interface StudentRow {
  sub: string;
  username: string;
  nickname: string;
  progress: CurriculumProgress;
  delayDays: number;
  lastStudiedDate?: string;
  inactiveDays?: number;
  streak: number;
  total: number;
  correct: number;
  examDate?: string;
  daysToExam?: number;
  projection?: Projection;
  pushEnabled: boolean;
  alerts: string[];
  enabled: boolean;
  firstLoginPending: boolean;
}

type Stock = Record<QuestionType, Partial<Record<ItemStatus, number>>>;

function AddStudentForm({ onAdded }: { onAdded: (msg: string) => void }) {
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [tempPassword, setTempPassword] = useState(generateTempPassword);
  const [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/admin/students", {
        username: username.trim(),
        nickname: nickname.trim(),
        tempPassword,
        examDate: examDate || undefined,
      });
      onAdded(`${nickname} さん（ログインID: ${username.trim()}、仮パスワード: ${tempPassword}）を追加しました。この内容を生徒に伝えてください。`);
      setUsername("");
      setNickname("");
      setExamDate("");
      setTempPassword(generateTempPassword());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>生徒を追加</h2>
      <div className="grid-2">
        <label className="field">
          <span>ログインID（英数字）</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例: taro01" autoCapitalize="none" required />
        </label>
        <label className="field">
          <span>ニックネーム（画面に表示）</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required />
        </label>
        <label className="field">
          <span>仮パスワード</span>
          <div className="row">
            <input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required />
            <button type="button" className="btn small-btn" onClick={() => setTempPassword(generateTempPassword())}>
              作り直す
            </button>
          </div>
        </label>
        <label className="field">
          <span>受験日（任意）</span>
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </label>
      </div>
      <p className="muted small">カリキュラムは生徒が初めて学習した日ではなく、追加した日から始まります（あとで生徒の詳細から変えられます）。</p>
      {error && <p className="error small">{error}</p>}
      <button className="btn primary" disabled={busy}>
        追加する
      </button>
    </form>
  );
}

export function Dashboard() {
  const [students, setStudents] = useState<StudentRow[]>();
  const [stock, setStock] = useState<Stock>();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [usage, setUsage] = useState<UsageSummary>();
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    Promise.all([
      api<{ students: StudentRow[] }>("GET", "/admin/students"),
      api<{ stock: Stock; forecast: Forecast | null }>("GET", "/admin/stock"),
      api<{ usage: UsageSummary }>("GET", "/admin/usage"),
    ])
      .then(([s, st, u]) => {
        setStudents(s.students);
        setStock(st.stock);
        setForecast(st.forecast);
        setUsage(u.usage);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <p className="page error">{error}</p>;
  if (!students || !stock || !usage) return <p className="page muted">読み込み中…</p>;

  const reviewCount = Object.values(stock).reduce((n, s) => n + (s.review ?? 0), 0);
  const reportedCount = Object.values(stock).reduce((n, s) => n + (s.reported ?? 0), 0);

  return (
    <main className="page wide stack">
      <div className="row between wrap">
        <h1 className="title">ダッシュボード</h1>
        <div className="row wrap small">
          <Link className="chip" to="/admin/items">
            確認待ち {reviewCount}件
          </Link>
          <Link className={`chip ${reportedCount ? "chip-alert" : ""}`} to="/admin/items">
            報告 {reportedCount}件
          </Link>
          <Link className="chip" to="/admin/generate">
            API {usage.totalJpy.toLocaleString()}円 / {usage.budgetJpy.toLocaleString()}円
          </Link>
        </div>
      </div>

      {message && <p className="card notice">{message}</p>}

      <section className="card stack">
        <div className="row between">
          <h2>生徒（{students.length}人）</h2>
          <button className="btn small-btn" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "閉じる" : "＋ 生徒を追加"}
          </button>
        </div>
        {students.length === 0 ? (
          <p className="muted">まだ生徒がいません。「生徒を追加」から登録してください。</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>生徒</th>
                  <th>進度</th>
                  <th>遅れ</th>
                  <th>最終学習</th>
                  <th>連続</th>
                  <th>正答率</th>
                  <th>受験まで</th>
                  <th>通知</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.sub} className={s.enabled ? undefined : "muted"}>
                    <td>
                      <Link to={`/admin/students/${s.sub}`}>
                        {s.alerts.length > 0 && "⚠ "}
                        {s.nickname}
                      </Link>
                      <div className="muted small">
                        {s.username}
                        {!s.enabled && "（停止中）"}
                        {s.firstLoginPending && "（未ログイン）"}
                      </div>
                      {s.alerts.map((a) => (
                        <div key={a} className="error small">
                          {a}
                        </div>
                      ))}
                    </td>
                    <td>
                      {s.progress.cycle}周目 {s.progress.day}日目
                    </td>
                    <td>{s.delayDays > 0 ? `${s.delayDays}日` : "-"}</td>
                    <td>{s.lastStudiedDate ? (s.inactiveDays === 0 ? "今日" : `${s.inactiveDays}日前`) : "-"}</td>
                    <td>{s.streak}日</td>
                    <td>{s.total ? `${Math.round((s.correct / s.total) * 100)}%` : "-"}</td>
                    <td>{s.daysToExam !== undefined && s.daysToExam >= 0 ? `${s.daysToExam}日` : "-"}</td>
                    <td>{s.pushEnabled ? "オン" : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StockForecastCard
        forecast={forecast}
        leadName={forecast ? students.find((s) => s.progress.cycle === forecast.lead.cycle && s.progress.day === forecast.lead.day)?.nickname : undefined}
      />

      {showAdd && (
        <AddStudentForm
          onAdded={(msg) => {
            setMessage(msg);
            setShowAdd(false);
            load();
          }}
        />
      )}
    </main>
  );
}
