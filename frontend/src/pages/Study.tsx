import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionView } from "../../../shared/types";
import { api } from "../api";
import { QuestionRunner, type RunnerSummary } from "../components/QuestionRunner";
import { SetSummary } from "../components/SetSummary";

interface SessionResponse {
  completedToday: boolean;
  session?: SessionView;
}

type Phase = { kind: "loading" } | { kind: "running"; setIndex: number } | { kind: "setDone"; setIndex: number; summary: RunnerSummary } | { kind: "dayDone"; summary: RunnerSummary };

const isSetDone = (session: SessionView, setIndex: number) =>
  session.sets[setIndex].entries.every((e) => e.questionIds.every((q) => q in session.answered));

export function Study({ onChanged }: { onChanged: () => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<SessionResponse>();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState("");
  const [dayTotals, setDayTotals] = useState({ total: 0, correct: 0 });

  const load = () =>
    api<SessionResponse>("GET", "/session")
      .then((res) => {
        setData(res);
        if (res.session) {
          const first = res.session.sets.findIndex((_, i) => !isSetDone(res.session!, i));
          setPhase({ kind: "running", setIndex: first === -1 ? 0 : first });
        }
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="page error">{error}</p>;
  if (!data) return <p className="page muted">読み込み中…</p>;

  const quit = () => {
    onChanged();
    navigate("/");
  };

  if (data.completedToday || !data.session) {
    return (
      <main className="page narrow stack">
        <section className="card stack">
          <h2>今日の分は完了しています 🎉</h2>
          <p>また明日、続きの日に進めます。時間があれば自由演習をしてみましょう。</p>
          <button className="btn primary" onClick={() => navigate("/practice")}>
            自由演習へ
          </button>
          <button className="btn" onClick={quit}>
            ホームへ
          </button>
        </section>
      </main>
    );
  }

  const session = data.session;
  if (session.sets.length === 0) {
    return (
      <main className="page narrow stack">
        <section className="card stack">
          <h2>問題を準備中です</h2>
          <p>今日の問題がまだ用意されていません。先生に知らせてください。</p>
          <button className="btn" onClick={quit}>
            ホームへ
          </button>
        </section>
      </main>
    );
  }

  const finishSet = (setIndex: number, summary: RunnerSummary) => {
    const totals = { total: dayTotals.total + summary.total, correct: dayTotals.correct + summary.correct };
    setDayTotals(totals);
    if (summary.dayCompleted) {
      onChanged();
      setPhase({ kind: "dayDone", summary: { ...summary, ...totals } });
    } else if (setIndex + 1 >= session.sets.length) {
      // 送信に失敗した設問などが残っていると完了にならないので、最新の状態を読み直して未解答から再開する
      setPhase({ kind: "loading" });
      load();
    } else {
      setPhase({ kind: "setDone", setIndex, summary });
    }
  };

  if (phase.kind === "running") {
    const set = session.sets[phase.setIndex];
    return (
      <main className="page narrow">
        <p className="muted small">
          {session.cycle}周目 {session.day}日目　セット {phase.setIndex + 1} / {session.sets.length}
        </p>
        <QuestionRunner
          key={phase.setIndex}
          title={set.label}
          entries={set.entries}
          items={session.items}
          context={set.kind === "review" ? "review" : "curriculum"}
          answered={session.answered}
          onFinish={(s) => finishSet(phase.setIndex, s)}
          onQuit={quit}
        />
      </main>
    );
  }

  if (phase.kind === "setDone") {
    const nextIndex = phase.setIndex + 1;
    return (
      <main className="page narrow stack">
        <SetSummary title={`${session.sets[phase.setIndex].label} のけっか`} summary={phase.summary} />
        <button className="btn primary" onClick={() => setPhase({ kind: "running", setIndex: nextIndex })}>
          次のセットへ（{session.sets[nextIndex].label}）
        </button>
        <button className="btn" onClick={quit}>
          ここで休む（続きはあとで）
        </button>
      </main>
    );
  }

  if (phase.kind === "dayDone") {
    const rate = phase.summary.total ? Math.round((phase.summary.correct / phase.summary.total) * 100) : 0;
    return (
      <main className="page narrow stack">
        <section className="card stack">
          <h2>
            {session.cycle}周目 {session.day}日目 完了！🎉
          </h2>
          {session.isMock ? (
            <p>
              模試のけっか: <strong className="big-score">{phase.summary.correct} / {phase.summary.total}</strong>（{rate}%）
              <br />
              {session.cycle}周目はこれで終わりです。記録のページで形式ごとの成績を前の周と比べられます。
            </p>
          ) : (
            <p>
              今日は {phase.summary.total} 問解いて {phase.summary.correct} 問正解でした（{rate}%）。
            </p>
          )}
          {session.shortage && <p className="muted small">問題の在庫が足りず、一部の問題数が少なくなっていました。</p>}
          <button className="btn primary" onClick={() => navigate(session.isMock ? "/records" : "/")}>
            {session.isMock ? "記録を見る" : "ホームへ"}
          </button>
        </section>
      </main>
    );
  }

  return <p className="page muted">読み込み中…</p>;
}
