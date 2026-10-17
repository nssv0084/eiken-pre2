import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import type { DayPlan } from "../../shared/curriculum";
import type { UserProfile } from "../../shared/types";
import { api } from "./api";
import { Generate } from "./pages/admin/Generate";
import { Items } from "./pages/admin/Items";
import { Home } from "./pages/Home";

export interface MeResponse {
  profile: UserProfile;
  today: DayPlan;
  completedDays: number;
}

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = useState<MeResponse>();
  const [error, setError] = useState("");

  useEffect(() => {
    api<MeResponse>("GET", "/me")
      .then(setMe)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="page error">{error}</p>;
  if (!me) return <p className="page muted">読み込み中…</p>;
  const isTeacher = me.profile.role === "teacher";

  return (
    <BrowserRouter>
      {isTeacher && (
        <nav className="topnav">
          <NavLink to="/" end>
            ホーム
          </NavLink>
          <NavLink to="/admin/generate">問題の生成</NavLink>
          <NavLink to="/admin/items">問題一覧</NavLink>
        </nav>
      )}
      <Routes>
        <Route path="/" element={<Home me={me} onSignOut={onSignOut} />} />
        {isTeacher && <Route path="/admin/generate" element={<Generate />} />}
        {isTeacher && <Route path="/admin/items" element={<Items />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
