import { useEffect, useState } from "react";
import type { DayPlan } from "../../../shared/curriculum";
import { QUESTION_TYPE_LABELS, type UserProfile } from "../../../shared/types";
import { api } from "../api";

interface MeResponse {
  profile: UserProfile;
  today: DayPlan;
  completedDays: number;
}

const slotLabel = (type: keyof typeof QUESTION_TYPE_LABELS, count: number, passage: boolean) =>
  `${QUESTION_TYPE_LABELS[type]} ${count}${passage ? "題" : "問"}`;

export function Home({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = useState<MeResponse>();
  const [error, setError] = useState("");

  useEffect(() => {
    api<MeResponse>("GET", "/me")
      .then(setMe)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="page error">{error}</p>;
  if (!me) return <p className="page muted">読み込み中…</p>;

  const { profile, today } = me;
  return (
    <main className="page narrow stack">
      <header className="row between">
        <h1 className="title">こんにちは、{profile.nickname} さん</h1>
        {profile.role === "teacher" && <span className="badge">講師</span>}
      </header>

      <section className="card stack">
        <p className="muted">
          今日の学習　{profile.progress.cycle}周目 {profile.progress.day}日目 / 30
        </p>
        <h2>{today.phase}</h2>
        <ul className="list">
          {today.slots.map((s, i) => (
            <li key={i}>{slotLabel(s.type, s.count, s.type === "cloze" || s.type === "reading")}</li>
          ))}
          {today.reviewMax > 0 && <li>復習 最大{today.reviewMax}問</li>}
        </ul>
        <button className="btn primary" disabled>
          はじめる（準備中）
        </button>
      </section>

      <button className="btn" onClick={onSignOut}>
        ログアウト
      </button>
    </main>
  );
}
