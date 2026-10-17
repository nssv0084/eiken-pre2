import { useNavigate } from "react-router-dom";
import { CURRICULUM_DAYS } from "../../../shared/curriculum";
import { daysBetween } from "../../../shared/dates";
import { isPassageType, QUESTION_TYPE_LABELS } from "../../../shared/types";
import type { MeResponse } from "../Shell";

export function Home({ me, onSignOut }: { me: MeResponse; onSignOut: () => void }) {
  const navigate = useNavigate();
  const { profile, today, projection } = me;
  const daysToExam = profile.examDate ? daysBetween(me.todayDate, profile.examDate) : undefined;

  return (
    <main className="page narrow stack">
      <header className="row between">
        <h1 className="title">こんにちは、{profile.nickname} さん</h1>
        {profile.role === "teacher" && <span className="badge">講師</span>}
      </header>

      <section className="row wrap stat-chips">
        <span className="chip">🔥 連続 {me.streak}日</span>
        {daysToExam !== undefined && daysToExam >= 0 && <span className="chip">受験まで あと {daysToExam}日</span>}
        {me.reviewQueue > 0 && <span className="chip">復習待ち {me.reviewQueue}問</span>}
      </section>

      <section className="card stack">
        <p className="muted">
          今日の学習　{profile.progress.cycle}周目 {profile.progress.day}日目 / {CURRICULUM_DAYS}
        </p>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${((profile.progress.day - 1) / CURRICULUM_DAYS) * 100}%` }} />
        </div>
        {me.completedToday ? (
          <>
            <h2>今日の分は完了しました 🎉</h2>
            <p className="muted small">次の日の分は明日（午前3時以降）に進めます。</p>
            <button className="btn" onClick={() => navigate("/practice")}>
              自由演習をする
            </button>
          </>
        ) : (
          <>
            <h2>{today.phase}</h2>
            <ul className="list">
              {today.slots.map((s, i) => (
                <li key={i}>
                  {QUESTION_TYPE_LABELS[s.type]}
                  {s.genre === "email" ? "（Eメール）" : s.genre === "explanation" ? "（説明文）" : ""} {s.count}
                  {isPassageType(s.type) ? "題" : "問"}
                </li>
              ))}
              {today.reviewMax > 0 && <li>復習（前に間違えた問題）最大{today.reviewMax}問</li>}
            </ul>
            <button className="btn primary" onClick={() => navigate("/study")}>
              はじめる・つづきから
            </button>
          </>
        )}
      </section>

      {projection && (
        <section className={`card small ${projection.reachesTwoCycles ? "" : "warn"}`}>
          このペースだと受験日までに <strong>{projection.cycle}周目の{projection.day}日目</strong> まで進めます。
          {!projection.reachesTwoCycles && " 2周に届かないので、毎日続けてみましょう。"}
        </section>
      )}
      {me.delayDays > 0 && <p className="muted small">予定より {me.delayDays}日 遅れています。</p>}

      <button className="btn" onClick={onSignOut}>
        ログアウト
      </button>

      <footer className="muted small">
        問題の語彙レベル判定に『CEFR-J Wordlist Version 1.6』東京外国語大学投野由紀夫研究室 を利用しています。
      </footer>
    </main>
  );
}
