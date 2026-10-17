import { useMemo, useState } from "react";
import type { AnswerContext, AnswerResult, PublicItem, PublicQuestion, StudyEntry } from "../../../shared/types";
import { api } from "../api";
import { ReportDialog } from "./ReportDialog";

export interface RunnerSummary {
  total: number;
  correct: number;
  wrong: { item: PublicItem; question: PublicQuestion; answerIndex: number }[];
  dayCompleted: boolean;
}

interface Step {
  item: PublicItem;
  question: PublicQuestion;
  indexInItem: number;
}

interface Props {
  title: string;
  entries: StudyEntry[];
  items: Record<string, PublicItem>;
  context: AnswerContext;
  assignmentId?: string;
  // 再開時に解答済みの設問を飛ばす
  answered?: Record<string, boolean>;
  onFinish: (summary: RunnerSummary) => void;
  onQuit: () => void;
}

function Passage({ item }: { item: PublicItem }) {
  return (
    <div className="passage-box">
      {item.title && <h3 className="item-title">{item.title}</h3>}
      <p className="passage">{item.passage}</p>
    </div>
  );
}

export function QuestionRunner({ title, entries, items, context, assignmentId, answered = {}, onFinish, onQuit }: Props) {
  const steps = useMemo<Step[]>(
    () =>
      entries.flatMap((e) => {
        const item = items[e.itemId];
        if (!item) return [];
        return e.questionIds
          .filter((id) => !(id in answered))
          .map((id) => ({ item, question: item.questions.find((q) => q.id === id)!, indexInItem: item.questions.findIndex((q) => q.id === id) }))
          .filter((s) => s.question);
      }),
    // 開始時点の解答状況で固定する（解答のたびに並びが変わらないように answered は依存に入れない）
    [entries, items],
  );

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number>();
  const [result, setResult] = useState<AnswerResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"passage" | "question">(() => (steps[0]?.item.passage ? "passage" : "question"));
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [summary, setSummary] = useState<RunnerSummary>({ total: 0, correct: 0, wrong: [], dayCompleted: false });

  if (steps.length === 0) {
    return (
      <div className="stack">
        <p className="muted">このセットの問題はすべて解き終わっています。</p>
        <button className="btn primary" onClick={() => onFinish(summary)}>
          次へ
        </button>
      </div>
    );
  }

  const step = steps[index];
  const hasPassage = !!step.item.passage;

  const answer = async (choice: number) => {
    if (result || busy) return;
    setChosen(choice);
    setBusy(true);
    setError("");
    try {
      const res = await api<AnswerResult>("POST", "/answers", { questionId: step.question.id, chosenIndex: choice, context, assignmentId });
      setResult(res);
      setSummary((s) => ({
        total: s.total + 1,
        correct: s.correct + (res.correct ? 1 : 0),
        wrong: res.correct ? s.wrong : [...s.wrong, { item: step.item, question: step.question, answerIndex: res.answerIndex }],
        dayCompleted: s.dayCompleted || !!res.dayCompleted,
      }));
    } catch (e) {
      setChosen(undefined);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (index + 1 >= steps.length) return onFinish(summary);
    const nextStep = steps[index + 1];
    // 同じ長文の続きの設問なら設問タブのまま、新しい長文なら本文から読む
    if (nextStep.item.id !== step.item.id) setTab(nextStep.item.passage ? "passage" : "question");
    setIndex(index + 1);
    setChosen(undefined);
    setResult(undefined);
    setReported(false);
  };

  const choiceClass = (j: number) => {
    if (!result) return "choice";
    if (j === result.answerIndex) return "choice correct";
    if (j === chosen) return "choice wrong";
    return "choice dim";
  };

  return (
    <div className="runner stack">
      <header className="row between">
        <button className="btn small-btn" onClick={onQuit}>
          中断
        </button>
        <span className="muted">
          {title}　{index + 1} / {steps.length}
        </span>
      </header>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${(index / steps.length) * 100}%` }} />
      </div>

      {hasPassage && (
        <div className="tabs only-narrow">
          <button className={tab === "passage" ? "active" : ""} onClick={() => setTab("passage")}>
            本文
          </button>
          <button className={tab === "question" ? "active" : ""} onClick={() => setTab("question")}>
            設問
          </button>
        </div>
      )}

      <div className={hasPassage ? "split" : undefined}>
        {hasPassage && (
          <div className={tab === "passage" ? "" : "hide-narrow"}>
            <Passage item={step.item} />
          </div>
        )}
        <div className={`stack ${hasPassage && tab !== "question" ? "hide-narrow" : ""}`}>
          <p className="stem">
            {step.item.questions.length > 1 && <strong>設問{step.indexInItem + 1}　</strong>}
            {step.question.stem}
          </p>
          <div className="stack-sm">
            {step.question.choices.map((c, j) => (
              <button key={j} className={choiceClass(j)} disabled={!!result || busy} onClick={() => answer(j)}>
                <span className="choice-no">{j + 1}</span>
                {c}
              </button>
            ))}
          </div>
          {error && <p className="error small">{error}</p>}

          {result && (
            <section className={`result card stack-sm ${result.correct ? "ok" : "ng"}`}>
              <strong>{result.correct ? "⭕ 正解！" : `❌ 不正解　正解: ${result.answerIndex + 1} ${step.question.choices[result.answerIndex]}`}</strong>
              <p className="explanation">{result.explanation}</p>
              <div className="row between">
                {reported ? (
                  <span className="muted small">報告しました</span>
                ) : (
                  <button className="btn small-btn" onClick={() => setReporting(true)}>
                    問題がおかしい
                  </button>
                )}
                <button className="btn primary" onClick={next}>
                  {index + 1 >= steps.length ? "結果を見る" : "次へ ▶"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {reporting && (
        <ReportDialog
          questionId={step.question.id}
          onClose={(sent) => {
            setReporting(false);
            if (sent) setReported(true);
          }}
        />
      )}
    </div>
  );
}
