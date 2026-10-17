import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PublicItem, StudyEntry } from "../../../shared/types";
import { api } from "../api";
import { QuestionRunner, type RunnerSummary } from "../components/QuestionRunner";
import { SetSummary } from "../components/SetSummary";

interface Response {
  assignment: { id: string; title: string; dueDate: string; entries: StudyEntry[] };
  items: Record<string, PublicItem>;
  answered: Record<string, boolean>;
}

export function AssignmentRun({ onChanged }: { onChanged: () => void }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Response>();
  const [summary, setSummary] = useState<RunnerSummary>();
  const [error, setError] = useState("");

  useEffect(() => {
    api<Response>("GET", `/assignments/${id}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const back = () => {
    onChanged();
    navigate("/");
  };

  if (error) return <p className="page error">{error}</p>;
  if (!data) return <p className="page muted">読み込み中…</p>;

  if (summary) {
    return (
      <main className="page narrow stack">
        <SetSummary title={`課題「${data.assignment.title}」のけっか`} summary={summary} />
        <button className="btn primary" onClick={back}>
          ホームへ
        </button>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <QuestionRunner
        title={`課題: ${data.assignment.title}`}
        entries={data.assignment.entries}
        items={data.items}
        context="assignment"
        assignmentId={data.assignment.id}
        answered={data.answered}
        onFinish={setSummary}
        onQuit={back}
      />
    </main>
  );
}
