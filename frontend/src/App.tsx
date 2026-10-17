import { getCurrentUser, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { Login } from "./pages/Login";
import { Shell } from "./Shell";

type AuthState = "loading" | "signedOut" | "signedIn";

export function App() {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    getCurrentUser()
      .then(() => setState("signedIn"))
      .catch(() => setState("signedOut"));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setState("signedOut");
  };

  if (state === "loading") return <p className="page muted">読み込み中…</p>;
  if (state === "signedOut") return <Login onSignedIn={() => setState("signedIn")} />;
  return <Shell onSignOut={handleSignOut} />;
}
