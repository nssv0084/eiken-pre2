import { updatePassword } from "aws-amplify/auth";
import { useState, type FormEvent } from "react";

export function UserSettings({ onSignOut }: { onSignOut: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updatePassword({ oldPassword, newPassword });
      setMessage("パスワードを変更しました");
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      const name = (err as Error).name;
      setError(
        name === "NotAuthorizedException"
          ? "今のパスワードが違います"
          : name === "InvalidPasswordException"
            ? "新しいパスワードは8文字以上で、数字を含めてください"
            : name === "LimitExceededException"
              ? "回数が多すぎます。しばらくしてからお試しください"
              : "変更できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page narrow stack">
      <h1 className="title">設定</h1>

      <section className="card stack">
        <h2>ホーム画面に追加する</h2>
        <p className="small">アプリのように、ホーム画面のアイコンから開けるようになります。</p>
        <ul className="list small">
          <li>iPhone（Safari）: 画面下の共有ボタン（□に↑）→「ホーム画面に追加」</li>
          <li>Android（Chrome）: 右上の︙メニュー →「ホーム画面に追加」または「アプリをインストール」</li>
        </ul>
      </section>

      <form className="card stack" onSubmit={change}>
        <h2>パスワードの変更</h2>
        <label className="field">
          <span>今のパスワード</span>
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>新しいパスワード（8文字以上、数字を含む）</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {message && <p>{message}</p>}
        {error && <p className="error small">{error}</p>}
        <button className="btn primary" disabled={busy}>
          変更する
        </button>
        <p className="muted small">パスワードを忘れたときは、先生に新しい仮パスワードを発行してもらってください。</p>
      </form>

      <button className="btn" onClick={onSignOut}>
        ログアウト
      </button>

      <footer className="muted small">
        問題の語彙レベル判定に『CEFR-J Wordlist Version 1.6』東京外国語大学投野由紀夫研究室 を利用しています。
      </footer>
    </main>
  );
}
