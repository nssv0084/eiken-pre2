import { isPassageType, QUESTION_TYPE_LABELS } from "../../../shared/types";
import type { MeResponse } from "../Shell";

export function Home({ me, onSignOut }: { me: MeResponse; onSignOut: () => void }) {
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
            <li key={i}>
              {QUESTION_TYPE_LABELS[s.type]} {s.count}
              {isPassageType(s.type) ? "題" : "問"}
            </li>
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

      <footer className="muted small">
        問題の語彙レベル判定に『CEFR-J Wordlist Version 1.6』東京外国語大学投野由紀夫研究室 を利用しています。
      </footer>
    </main>
  );
}
