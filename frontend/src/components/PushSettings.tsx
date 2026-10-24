import { useEffect, useState } from "react";
import { api } from "../api";
import { disablePush, enablePush, getPushState, resyncPush, type PushState } from "../push";

const DISMISS_KEY = "pushPromptDismissedAt";
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function usePushState() {
  const [state, setState] = useState<PushState>();
  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);
  return [state, setState] as const;
}

export function PushSettings({ isTeacher }: { isTeacher: boolean }) {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message || "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h2>毎日のお知らせ</h2>
      <p className="small">毎日20時に、その日まだ学習していないときだけスマホに通知が届きます。</p>
      {isTeacher && <p className="muted small">講師のアカウントには毎日のお知らせは届きません（テスト通知だけ届きます）。</p>}
      {state === undefined && <p className="muted small">確認中…</p>}
      {state === "unsupported" && (
        <p className="muted small">このブラウザでは通知を使えません。Android は Chrome で開いてください。iPhone はホーム画面に追加したアイコンから開くと使えます。</p>
      )}
      {state === "denied" && (
        <p className="error small">
          通知がブロックされています。Chrome のアドレスバー左のアイコン →「権限」→「通知」を許可にしてから、この画面を開き直してください。
        </p>
      )}
      {state === "off" && (
        <button className="btn primary" disabled={busy} onClick={() => run(async () => setState(await enablePush()))}>
          通知をオンにする
        </button>
      )}
      {state === "on" && (
        <>
          <p className="small">
            <strong>通知はオンです。</strong>
          </p>
          <div className="row wrap">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("POST", "/push/test");
                  setMessage("テスト通知を送りました。数秒で届きます。");
                })
              }
            >
              テスト通知を送る
            </button>
            <button className="btn" disabled={busy} onClick={() => run(async () => setState(await disablePush()))}>
              オフにする
            </button>
          </div>
        </>
      )}
      {message && <p className="small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}

// ホームに出す案内。オフの生徒にだけ出し、「あとで」を押したら7日間は出さない
export function PushPrompt() {
  const [state, setState] = usePushState();
  const [hidden, setHidden] = useState(dismissedRecently);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state === "on") resyncPush().catch(() => undefined);
  }, [state]);

  if (state !== "off" || hidden) return null;

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 保存できなくても、この画面の間は隠す
    }
    setHidden(true);
  };

  return (
    <section className="card stack-sm">
      <strong>🔔 毎日のお知らせをオンにしよう</strong>
      <span className="small muted">20時になっても学習していない日だけ、スマホに通知が届きます。</span>
      <div className="row">
        <button
          className="btn primary small-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setState(await enablePush());
            } catch {
              setState("off");
            } finally {
              setBusy(false);
            }
          }}
        >
          オンにする
        </button>
        <button className="btn small-btn" onClick={later}>
          あとで
        </button>
      </div>
    </section>
  );
}
