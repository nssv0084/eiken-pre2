import { useState, type FormEvent } from "react";
import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from "../../../shared/types";
import { api } from "../api";

export function ReportDialog({ questionId, onClose }: { questionId: string; onClose: (sent: boolean) => void }) {
  const [reason, setReason] = useState<ReportReason>("wrong-answer");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/reports", { questionId, reason, comment: comment.trim() || undefined });
      onClose(true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <form className="card stack dialog" onSubmit={submit}>
        <h2>問題がおかしいときの報告</h2>
        <p className="muted small">先生が確認するまで、この問題はほかの人に出なくなります。</p>
        <div className="stack-sm">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="radio">
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
              {REPORT_REASON_LABELS[r]}
            </label>
          ))}
        </div>
        <label className="field">
          <span>くわしく（任意）</span>
          <textarea value={comment} maxLength={300} rows={3} onChange={(e) => setComment(e.target.value)} />
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="row">
          <button type="button" className="btn" onClick={() => onClose(false)}>
            やめる
          </button>
          <button className="btn primary" disabled={busy}>
            送る
          </button>
        </div>
      </form>
    </div>
  );
}
