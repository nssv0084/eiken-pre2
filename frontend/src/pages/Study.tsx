import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionView } from "../../../shared/types";
import { api } from "../api";
import { Confetti } from "../components/Confetti";
import { QuestionRunner, type RunnerSummary } from "../components/QuestionRunner";
import { SetSummary } from "../components/SetSummary";

interface SessionResponse {
  completedToday: boolean;
  session?: SessionView;
}

type Phase = { kind: "loading" } | { kind: "running"; setIndex: number } | { kind: "setDone"; setIndex: number; summary: RunnerSummary } | { kind: "dayDone"; summary: RunnerSummary };

const STREAK_MILESTONES: Record<number, string> = {
  3: "3日連続達成！いい流れができてきました",
  7: "1週間連続達成！習慣になってきましたね",
  14: "2週間連続達成！すごい集中力です",
  21: "3週間連続達成！合格がぐっと近づいています",
  30: "30日連続達成！本当にすばらしい！",
  50: "50日連続達成！もう英語が生活の一部です",
  100: "100日連続達成！伝説級の努力です",
};

function DayComplete({ session, summary, onDone }: { session: SessionView; summary: RunnerSummary; onDone: (to: string) => void }) {
  const [streak, setStreak] = useState<number>();
  useEffect(() => {
    api<{ streak: number }>("GET", "/me")
      .then((me) => setStreak(me.streak))
      .catch(() => undefined);
  }, []);

  return (
    <main className="page narrow stack celebrate">
      <Confetti />
      <div className="stamp">
        <span className="day">
          {session.cycle}周目 {session.day}日目
        </span>
        <span className="clear">クリア！</span>
      </div>
      {streak !== undefined && (
        <p className="milestone">
          🔥 {streak}日連続
          {STREAK_MILESTONES[streak] && (
            <>
              <br />
              {STREAK_MILESTONES[streak]}
            </>
          )}
        </p>
      )}
      <SetSummary title={session.isMock ? "模試のけっか" : "今日のけっか"} summary={summary} />
      {session.isMock && (
        <p className="card small">
          {session.cycle}周目はこれで終わりです。記録のページで、形式ごとの成績を前の周と比べられます。
        </p>
      )}
      {session.shortage && <p className="muted small">問題の在庫が足りず、一部の問題数が少なくなっていました。</p>}
      <button className="btn primary btn-hero" onClick={() => onDone(session.isMock ? "/records" : "/")}>
        {session.isMock ? "記録を見る" : "ホームへ"}
      </button>
    </main>
  );
}

const isSetDone = (session: SessionView, setIndex: number) =>
  session.sets[setIndex].entries.every((e) => e.questionIds.every((q) => q in session.answered));

export function Study({ onChanged }: { onChanged: () => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<SessionResponse>();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState("");
  const [dayTotals, setDayTotals] = useState<Pick<RunnerSummary, "total" | "correct" | "wrong">>({ total: 0, correct: 0, wrong: [] });

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

  // 問題を解いていたときのスクロール位置のまま結果画面を出さないよう、画面が変わったら先頭に戻す
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase.kind]);

  if (error) return <p className="page error">{error}</p>;
  if (!data) return <p className="page muted">読み込み中…</p>;

  const quit = () => {
    onChanged();
    navigate("/");
  };

  if (data.completedToday || !data.session) {
    return (
      <main className="page narrow stack">
        <section className="card stack celebrate">
          <div className="done-banner big">🎉</div>
          <h2>今日の分は完了しています</h2>
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
    const totals = {
      total: dayTotals.total + summary.total,
      correct: dayTotals.correct + summary.correct,
      wrong: [...dayTotals.wrong, ...summary.wrong],
    };
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
        <button className="btn primary btn-hero" onClick={() => setPhase({ kind: "running", setIndex: nextIndex })}>
          次へ：{session.sets[nextIndex].label} ▶
        </button>
        <button className="btn" onClick={quit}>
          ここで休む（続きはあとで）
        </button>
      </main>
    );
  }

  if (phase.kind === "dayDone") {
    return <DayComplete session={session} summary={phase.summary} onDone={(to) => navigate(to)} />;
  }

  return <p className="page muted">読み込み中…</p>;
}
