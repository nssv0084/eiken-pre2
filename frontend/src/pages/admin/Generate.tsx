import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  isPassageType,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type GenerateJob,
  type ItemStatus,
  type QuestionType,
  type UsageSummary,
} from "../../../../shared/types";
import { api } from "../../api";

interface UsageResponse {
  usage: UsageSummary;
  usdJpy: number;
  estimatedUsdPerItem: Record<QuestionType, number>;
  maxPerJob: Record<QuestionType, number>;
  models: { generation: string; verification: string };
}

type Stock = Record<QuestionType, Partial<Record<ItemStatus, number>>>;
type Calibration = Record<QuestionType, { approved: number; target: number }>;

const JOB_STATUS_LABELS: Record<GenerateJob["status"], string> = {
  queued: "待機中",
  running: "生成中",
  done: "完了",
  error: "エラー",
};

const GENRE_LABELS = { email: "Eメール", explanation: "説明文" } as const;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function Generate() {
  const [usage, setUsage] = useState<UsageResponse>();
  const [stock, setStock] = useState<Stock>();
  const [calibration, setCalibration] = useState<Calibration>();
  const [jobs, setJobs] = useState<GenerateJob[]>([]);
  const [type, setType] = useState<QuestionType>("vocab");
  const [genre, setGenre] = useState<"email" | "explanation">("email");
  const [count, setCount] = useState(10);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [u, s, j] = await Promise.all([
        api<UsageResponse>("GET", "/admin/usage"),
        api<{ stock: Stock; calibration: Calibration }>("GET", "/admin/stock"),
        api<{ jobs: GenerateJob[] }>("GET", "/admin/jobs"),
      ]);
      setUsage(u);
      setStock(s.stock);
      setCalibration(s.calibration);
      setJobs(j.jobs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 生成中のジョブがある間だけ5秒ごとに更新する
  const hasActiveJob = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [hasActiveJob, refresh]);

  if (!usage || !stock || !calibration) return <p className="page muted">{error || "読み込み中…"}</p>;

  const max = usage.maxPerJob[type];
  const safeCount = Math.min(Math.max(1, count), max);
  const estimateJpy = Math.ceil(usage.estimatedUsdPerItem[type] * safeCount * usage.usdJpy);
  const unit = isPassageType(type) ? "題" : "問";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("POST", "/admin/generate", {
        type,
        count: safeCount,
        genre: type === "reading" ? genre : undefined,
        topic: topic.trim() || undefined,
      });
      setMessage("生成を開始しました。数分かかります。");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ratio = Math.min(1, usage.usage.totalJpy / usage.usage.budgetJpy);

  return (
    <main className="page wide stack">
      <h1 className="title">問題の生成</h1>

      <section className="card stack">
        <div className="row between">
          <h2>API 使用額</h2>
          <span>
            {usage.usage.totalJpy.toLocaleString()}円 / {usage.usage.budgetJpy.toLocaleString()}円
          </span>
        </div>
        <div className="meter">
          <div className="meter-fill" style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="muted small">
          {usage.usage.stopAtJpy.toLocaleString()}円に達すると生成を停止します。生成: {usage.models.generation} ／ 検証:{" "}
          {usage.models.verification}（1ドル={usage.usdJpy}円で換算）
        </p>
      </section>

      <section className="card stack">
        <h2>問題の在庫</h2>
        <table className="table">
          <thead>
            <tr>
              <th>形式</th>
              <th>出題中</th>
              <th>うち確認待ち</th>
              <th>報告あり</th>
              <th>無効</th>
              <th>講師の承認</th>
            </tr>
          </thead>
          <tbody>
            {QUESTION_TYPES.map((t) => {
              const s = stock[t];
              const c = calibration[t];
              return (
                <tr key={t}>
                  <td>{QUESTION_TYPE_LABELS[t]}</td>
                  <td>{(s.approved ?? 0) + (s.review ?? 0)}</td>
                  <td>{s.review ?? 0}</td>
                  <td>{s.reported ?? 0}</td>
                  <td>{s.disabled ?? 0}</td>
                  <td className={c.approved < c.target ? "error" : undefined}>
                    {c.approved} / {c.target}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">
          講師の承認が目標数に届くまでは、AI検証に合格した問題もすべて「確認待ち」になります（難しさの基準合わせのため）。
        </p>
      </section>

      <form className="card stack" onSubmit={handleSubmit}>
        <h2>新しく作る</h2>
        <label className="field">
          <span>形式</span>
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as QuestionType;
              setType(t);
              setCount(Math.min(count, usage.maxPerJob[t]));
            }}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {type === "reading" && (
          <label className="field">
            <span>ジャンル</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value as "email" | "explanation")}>
              <option value="email">{GENRE_LABELS.email}（設問3問）</option>
              <option value="explanation">{GENRE_LABELS.explanation}（設問4問）</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>
            数（1回に{max}
            {unit}まで）
          </span>
          <input type="number" min={1} max={max} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>テーマ（任意。空ならいろいろな題材から選びます）</span>
          <input value={topic} maxLength={50} placeholder="例: 環境問題" onChange={(e) => setTopic(e.target.value)} />
        </label>
        <p className="muted small">費用の目安: 約{estimateJpy.toLocaleString()}円（生成とAI検証の合計）</p>
        {message && <p>{message}</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || !usage.usage.canGenerate}>
          生成する
        </button>
      </form>

      <section className="card stack">
        <h2>生成の履歴</h2>
        {jobs.length === 0 ? (
          <p className="muted">まだありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>日時</th>
                <th>形式</th>
                <th>状態</th>
                <th>合格</th>
                <th>不合格</th>
                <th>費用</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{formatDateTime(j.createdAt)}</td>
                  <td>
                    {QUESTION_TYPE_LABELS[j.type]}
                    {j.genre && `（${GENRE_LABELS[j.genre as keyof typeof GENRE_LABELS]}）`}
                    {j.topic && <div className="muted small">テーマ: {j.topic}</div>}
                  </td>
                  <td>
                    {JOB_STATUS_LABELS[j.status]}
                    {j.error && <div className="error small">{j.error}</div>}
                  </td>
                  <td>
                    {j.approved + j.review} / {j.count}
                  </td>
                  <td>{j.rejected}</td>
                  <td>{Math.round(j.usd * usage.usdJpy)}円</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
