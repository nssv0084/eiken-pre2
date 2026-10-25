import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { daysBetween } from "../../../shared/dates";
import { isPassageType, QUESTION_TYPE_LABELS, type AssignmentProgress, type QuestionType } from "../../../shared/types";
import { api } from "../api";
import { DayTrack } from "../components/DayTrack";
import { Icon, TYPE_ICONS } from "../components/Icon";
import { PushPrompt } from "../components/PushSettings";
import type { MeResponse } from "../Shell";

type MyAssignment = AssignmentProgress & { id: string; title: string; type: QuestionType; dueDate: string; questionCount: number };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "おはよう";
  if (h < 18) return "こんにちは";
  return "こんばんは";
}

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
          <div key={a.id} className={`card assignment-card row between ${overdue ? "warn" : ""}`}>
            <div>
              <div className="small muted row">
                <Icon name="pin" size={16} /> 先生からの課題 ・ 期限 {a.dueDate.slice(5).replace("-", "/")}
                {overdue && "（期限切れ）"}
              </div>
              <strong>{a.title}</strong>
              <div className="small muted">
                {QUESTION_TYPE_LABELS[a.type]} {a.answered}/{a.questionCount}問
              </div>
            </div>
            {a.completedAt ? (
              <span className="chip">
                <Icon name="check" size={16} /> 完了
              </span>
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
      <section className="hero">
        <div className="row between">
          <p className="greeting">
            {greeting()}、{profile.nickname} さん
          </p>
          {profile.role === "teacher" && <span className="badge subtle">講師</span>}
        </div>
        <div className="hero-stats">
          <div className="hero-stat flame">
            <div className="value">
              🔥{me.streak}
              <span className="unit">日</span>
            </div>
            <div className="label">連続学習</div>
          </div>
          <div className="hero-stat">
            <div className="value">
              {daysToExam !== undefined && daysToExam >= 0 ? (
                <>
                  {daysToExam}
                  <span className="unit">日</span>
                </>
              ) : (
                "-"
              )}
            </div>
            <div className="label">受験まで</div>
          </div>
          <div className="hero-stat">
            <div className="value">
              {me.reviewQueue}
              <span className="unit">問</span>
            </div>
            <div className="label">復習待ち</div>
          </div>
        </div>
      </section>

      {profile.role === "student" && <PushPrompt />}

      <AssignmentCards todayDate={me.todayDate} />

      <section className="card today-card">
        <div className="today-head">
          <span className="day-label">
            {me.completedToday ? "今日はクリア！" : `${profile.progress.day}日目`}
            <small>　{profile.progress.cycle}周目</small>
          </span>
          {!me.completedToday && <span className="muted small">{today.phase}</span>}
        </div>
        <DayTrack day={profile.progress.day} completedToday={me.completedToday} />

        {me.completedToday ? (
          <div className="done-banner stack-sm">
            <div className="big">🎉</div>
            <strong>今日の分はおわりました！</strong>
            <span className="muted small">次の日の分は明日（午前3時以降）に進めます。</span>
            <button className="btn" onClick={() => navigate("/practice")}>
              自由演習でもっと練習する
            </button>
          </div>
        ) : (
          <>
            <ul className="plan-list">
              {today.slots.map((s, i) => (
                <li key={i}>
                  <span className="plan-icon">
                    <Icon name={TYPE_ICONS[s.type]} size={18} />
                  </span>
                  {QUESTION_TYPE_LABELS[s.type]}
                  {s.genre === "email" ? "（Eメール）" : s.genre === "explanation" ? "（説明文）" : s.genre === "dialogue" ? "（長い会話）" : ""}
                  <span className="count">
                    {s.count}
                    {isPassageType(s.type) || s.genre === "dialogue" ? "題" : "問"}
                  </span>
                </li>
              ))}
              {today.reviewMax > 0 && me.reviewQueue > 0 && (
                <li>
                  <span className="plan-icon">
                    <Icon name="repeat" size={18} />
                  </span>
                  復習（前に間違えた問題）
                  <span className="count">最大{today.reviewMax}問</span>
                </li>
              )}
            </ul>
            <button className="btn primary btn-hero" onClick={() => navigate("/study")}>
              はじめる ▶
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
