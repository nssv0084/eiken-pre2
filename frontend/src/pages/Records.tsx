import { useEffect, useState } from "react";
import { api } from "../api";
import { StatsView, type StatsData } from "../components/StatsView";

export function Records() {
  const [data, setData] = useState<StatsData>();
  const [error, setError] = useState("");

  useEffect(() => {
    api<StatsData>("GET", "/me/stats")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="page error">{error}</p>;
  if (!data) return <p className="page muted">読み込み中…</p>;

  return (
    <main className="page narrow stack">
      <h1 className="title">学習記録</h1>
      <StatsView data={data} />
    </main>
  );
}
