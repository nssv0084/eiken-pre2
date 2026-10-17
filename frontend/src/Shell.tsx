import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { DayPlan, Projection } from "../../shared/curriculum";
import type { UserProfile } from "../../shared/types";
import { api } from "./api";
import { Assignments } from "./pages/admin/Assignments";
import { Dashboard } from "./pages/admin/Dashboard";
import { Generate } from "./pages/admin/Generate";
import { Items } from "./pages/admin/Items";
import { Settings } from "./pages/admin/Settings";
import { StudentDetail } from "./pages/admin/StudentDetail";
import { AssignmentRun } from "./pages/AssignmentRun";
import { Home } from "./pages/Home";
import { Practice } from "./pages/Practice";
import { Records } from "./pages/Records";
import { Study } from "./pages/Study";
import { UserSettings } from "./pages/UserSettings";

export interface MeResponse {
  profile: UserProfile;
  today: DayPlan;
  todayDate: string;
  completedToday: boolean;
  completedDays: number;
  streak: number;
  delayDays: number;
  projection?: Projection;
  reviewQueue: number;
}

function TabBar() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/study") || pathname.startsWith("/assignments/")) return null;
  return (
    <nav className="tabbar">
      <NavLink to="/" end>
        ホーム
      </NavLink>
      <NavLink to="/practice">自由演習</NavLink>
      <NavLink to="/records">記録</NavLink>
      <NavLink to="/settings">設定</NavLink>
    </nav>
  );
}

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = useState<MeResponse>();
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<MeResponse>("GET", "/me")
      .then(setMe)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(reload, [reload]);

  if (error) return <p className="page error">{error}</p>;
  if (!me) return <p className="page muted">読み込み中…</p>;
  const isTeacher = me.profile.role === "teacher";

  return (
    <BrowserRouter>
      {isTeacher && (
        <nav className="topnav">
          <span className="muted small">講師</span>
          <NavLink to="/admin" end>
            ダッシュボード
          </NavLink>
          <NavLink to="/admin/assignments">課題</NavLink>
          <NavLink to="/admin/generate">問題の生成</NavLink>
          <NavLink to="/admin/items">問題一覧</NavLink>
          <NavLink to="/admin/settings">設定</NavLink>
        </nav>
      )}
      <div className="with-tabbar">
        <Routes>
          <Route path="/" element={<Home me={me} />} />
          <Route path="/study" element={<Study onChanged={reload} />} />
          <Route path="/practice" element={<Practice onChanged={reload} />} />
          <Route path="/records" element={<Records />} />
          <Route path="/settings" element={<UserSettings onSignOut={onSignOut} />} />
          <Route path="/assignments/:id" element={<AssignmentRun onChanged={reload} />} />
          {isTeacher && <Route path="/admin" element={<Dashboard />} />}
          {isTeacher && <Route path="/admin/students/:sub" element={<StudentDetail />} />}
          {isTeacher && <Route path="/admin/assignments" element={<Assignments />} />}
          {isTeacher && <Route path="/admin/settings" element={<Settings />} />}
          {isTeacher && <Route path="/admin/generate" element={<Generate />} />}
          {isTeacher && <Route path="/admin/items" element={<Items />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <TabBar />
    </BrowserRouter>
  );
}
