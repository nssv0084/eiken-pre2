import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CURRICULUM_DAYS } from "../../../shared/curriculum";
import { daysBetween } from "../../../shared/dates";
import { isPassageType, QUESTION_TYPE_LABELS, type AssignmentProgress, type QuestionType } from "../../../shared/types";
import { api } from "../api";
import type { MeResponse } from "../Shell";

type MyAssignment = AssignmentProgress & { id: string; title: string; type: QuestionType; dueDate: string; questionCount: number };

function AssignmentCards({ todayDate }: { todayDate: string }) {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);

  useEffect(() => {
    api<{ assignments: MyAssignment[] }>("GET", "/assignments")
      .then((r) => setAssignments(r.assignments))
      .catch(() => setAssignments([]));
  }, []);

  if (assignments.length === 0) return null;
  return (
    <section className="stack-sm">
      {assignments.map((a) => {
        const overdue = !a.completedAt && a.dueDate < todayDate;
        return (
          <div key={a.id} className={`card row between ${overdue ? "warn" : ""}`}>
            <div>
              <div className="small muted">
                📌 課題 ・ 期限 {a.dueDate.slice(5).replace("-", "/")}
                {overdue && "（期限切れ）"}
              </div>
              <strong>{a.title}</strong>
              <div className="small muted">
                {QUESTION_TYPE_LABELS[a.type]} {a.answered}/{a.questionCount}問
              </div>
            </div>
            {a.completedAt ? (
              <span className="chip">完了</span>
            ) : (
              <button className="btn primary small-btn" onClick={() => navigate(`/assignments/${a.id}`)}>
                {a.answered > 0 ? "つづき" : "はじめる"}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function Home({ me }: { me: MeResponse }) {
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

      <AssignmentCards todayDate={me.todayDate} />

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
    </main>
  );
}
