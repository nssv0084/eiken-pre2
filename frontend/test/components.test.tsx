import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerResult, PublicItem } from "../../shared/types";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...args: unknown[]) => api(...args) }));

const { DayTrack } = await import("../src/components/DayTrack");
const { SetSummary } = await import("../src/components/SetSummary");
const { QuestionRunner } = await import("../src/components/QuestionRunner");

describe("DayTrack", () => {
  it("今日の日は目立たせ、前の日は完了にする", () => {
    const { container } = render(<DayTrack day={4} completedToday={false} />);
    expect(container.querySelectorAll(".day-dot.done")).toHaveLength(3);
    expect(container.querySelectorAll(".day-dot.today")).toHaveLength(1);
    expect(container.querySelectorAll(".day-dot")).toHaveLength(30);
    expect(screen.getByLabelText("30日中3日完了")).toBeInTheDocument();
  });

  it("30日目を終えた直後は30日すべて完了に見せる", () => {
    const { container } = render(<DayTrack day={1} completedToday />);
    expect(container.querySelectorAll(".day-dot.done")).toHaveLength(30);
  });
});

const item: PublicItem = {
  id: "i1",
  type: "vocab",
  title: "",
  passage: "",
  questions: [{ id: "q1", stem: "She ( ) her homework.", choices: ["did", "made", "took", "put"] }],
} as unknown as PublicItem;

const wrongSummary = (n: number) => ({
  total: 10,
  correct: 10 - n,
  dayCompleted: false,
  wrong: Array.from({ length: n }, (_, i) => ({
    item,
    question: { id: `w${i}`, stem: `問題${i}`, choices: ["a", "b", "c", "d"] },
    answerIndex: 1,
  })),
});

describe("SetSummary", () => {
  it("全問正解ならパーフェクトと表示し、間違いの一覧は出さない", () => {
    render(<SetSummary title="語彙" summary={wrongSummary(0)} />);
    expect(screen.getByText("パーフェクト！すばらしい！")).toBeInTheDocument();
    expect(screen.queryByText(/間違えた問題/)).not.toBeInTheDocument();
  });

  it("間違いは5問まで見せ、残りは「すべて見る」で開く", async () => {
    render(<SetSummary title="語彙" summary={wrongSummary(7)} />);
    expect(screen.getAllByText(/正解:/)).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: /あと2問/ }));
    expect(screen.getAllByText(/正解:/)).toHaveLength(7);
  });
});

describe("QuestionRunner", () => {
  beforeEach(() => api.mockReset());

  it("[CUR-08] 長い会話は、会話の本文と設問をタブで切り替えて表示する", async () => {
    const dialogue = {
      id: "d1",
      type: "conversation",
      genre: "dialogue",
      title: "",
      passage: "A: Hi.\nB: ( 1 )\nA: OK.\nB: ( 2 )",
      questions: [
        { id: "d1:0", stem: "( 1 )", choices: ["a1", "b1", "c1", "d1"] },
        { id: "d1:1", stem: "( 2 )", choices: ["a2", "b2", "c2", "d2"] },
      ],
    } as unknown as PublicItem;
    render(
      <QuestionRunner
        title="会話文（長い会話）"
        entries={[{ itemId: "d1", questionIds: ["d1:0", "d1:1"] }]}
        items={{ d1: dialogue }}
        context="curriculum"
        onFinish={vi.fn()}
        onQuit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "本文" })).toHaveClass("active");
    expect(screen.getByText(/A: Hi./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "設問" }));
    expect(screen.getByRole("button", { name: "設問" })).toHaveClass("active");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  const renderRunner = (onFinish = vi.fn()) =>
    render(
      <QuestionRunner
        title="語彙"
        entries={[{ itemId: "i1", questionIds: ["q1"] }]}
        items={{ i1: item }}
        context="curriculum"
        onFinish={onFinish}
        onQuit={vi.fn()}
      />,
    );

  it("選んだ答えを送り、不正解なら正解と解説を見せる", async () => {
    const res: AnswerResult = { correct: false, answerIndex: 0, explanation: "did は「する」。" } as AnswerResult;
    api.mockResolvedValue(res);
    renderRunner();
    await userEvent.click(screen.getByRole("button", { name: /made/ }));
    expect(api).toHaveBeenCalledWith("POST", "/answers", expect.objectContaining({ questionId: "q1", chosenIndex: 1, context: "curriculum" }));
    expect(await screen.findByText("おしい！")).toBeInTheDocument();
    expect(screen.getByText(/正解は 1\. did/)).toBeInTheDocument();
    expect(screen.getByText("did は「する」。")).toBeInTheDocument();
  });

  it("送信に失敗したら選び直せる", async () => {
    api.mockRejectedValueOnce(new Error("通信エラー"));
    renderRunner();
    await userEvent.click(screen.getByRole("button", { name: /took/ }));
    expect(await screen.findByText("通信エラー")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /took/ })).toBeEnabled());
  });

  it("最後の問題のあと「次へ」で結果を渡す", async () => {
    api.mockResolvedValue({ correct: true, answerIndex: 0, explanation: "ok" });
    const onFinish = vi.fn();
    renderRunner(onFinish);
    await userEvent.click(screen.getByRole("button", { name: /did/ }));
    await userEvent.click(await screen.findByRole("button", { name: "結果を見る" }));
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ total: 1, correct: 1 }));
  });
});
