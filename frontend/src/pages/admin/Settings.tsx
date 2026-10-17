import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Settings as SettingsData } from "../../../../shared/types";
import { api } from "../../api";
import { generateTempPassword } from "../../tempPassword";

interface Teacher {
  username: string;
  nickname: string;
  enabled: boolean;
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState({ username: "", nickname: "", tempPassword: generateTempPassword() });

  const load = useCallback(() => {
    Promise.all([api<{ settings: SettingsData }>("GET", "/admin/settings"), api<{ teachers: Teacher[] }>("GET", "/admin/teachers")])
      .then(([s, t]) => {
        setSettings(s.settings);
        setTeachers(t.teachers);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (!settings) return <p className="page muted">{error || "読み込み中…"}</p>;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(done);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    run(
      () =>
        api("PUT", "/admin/settings", {
          budgetJpy: settings.budgetJpy,
          usdJpy: settings.usdJpy,
          inactiveAlertDays: settings.inactiveAlertDays,
        }),
      "設定を保存しました",
    );
  };

  const addTeacher = (e: FormEvent) => {
    e.preventDefault();
    const t = teacher;
    run(async () => {
      await api("POST", "/admin/teachers", { ...t, username: t.username.trim(), nickname: t.nickname.trim() });
      setTeacher({ username: "", nickname: "", tempPassword: generateTempPassword() });
    }, `講師 ${t.nickname}（ログインID: ${t.username.trim()}、仮パスワード: ${t.tempPassword}）を追加しました。`);
  };

  return (
    <main className="page wide stack">
      <h1 className="title">設定</h1>
      {message && <p className="card notice">{message}</p>}
      {error && <p className="error">{error}</p>}

      <form className="card stack" onSubmit={save}>
        <h2>アプリの設定</h2>
        <div className="grid-2">
          <label className="field">
            <span>API の予算（円）。9割に達すると問題の生成を止めます</span>
            <input
              type="number"
              min={0}
              value={settings.budgetJpy}
              onChange={(e) => setSettings({ ...settings, budgetJpy: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>為替レート（1ドル = 円）</span>
            <input
              type="number"
              min={50}
              max={400}
              value={settings.usdJpy}
              onChange={(e) => setSettings({ ...settings, usdJpy: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>未学習アラート（何日学習していなければ知らせるか）</span>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.inactiveAlertDays}
              onChange={(e) => setSettings({ ...settings, inactiveAlertDays: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="muted small">
          問題の生成: {settings.generationModel} ／ 検証: {settings.verificationModel} ／ 抜き取り確認の割合: {Math.round(settings.spotCheckRate * 100)}%
        </p>
        <button className="btn primary" disabled={busy}>
          保存する
        </button>
      </form>

      <section className="card stack">
        <h2>講師</h2>
        <ul className="list">
          {teachers.map((t) => (
            <li key={t.username}>
              {t.nickname}（{t.username}）{!t.enabled && " 停止中"}
            </li>
          ))}
        </ul>
        <form className="stack" onSubmit={addTeacher}>
          <div className="grid-2">
            <label className="field">
              <span>ログインID</span>
              <input value={teacher.username} onChange={(e) => setTeacher({ ...teacher, username: e.target.value })} autoCapitalize="none" required />
            </label>
            <label className="field">
              <span>ニックネーム</span>
              <input value={teacher.nickname} onChange={(e) => setTeacher({ ...teacher, nickname: e.target.value })} maxLength={20} required />
            </label>
            <label className="field">
              <span>仮パスワード</span>
              <input value={teacher.tempPassword} onChange={(e) => setTeacher({ ...teacher, tempPassword: e.target.value })} required />
            </label>
          </div>
          <button className="btn" disabled={busy}>
            講師を追加
          </button>
        </form>
      </section>
    </main>
  );
}
