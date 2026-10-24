import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...a: unknown[]) => api(...a) }));

const push = { getPushState: vi.fn(), enablePush: vi.fn(), disablePush: vi.fn(), resyncPush: vi.fn() };
vi.mock("../src/push", () => push);

const { PushSettings, PushPrompt } = await import("../src/components/PushSettings");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  push.resyncPush.mockResolvedValue(undefined);
});

describe("毎日のお知らせ（設定画面）", () => {
  it("[STK-14] オフなら「オンにする」で登録し、オンになったらテスト通知とオフのボタンを出す", async () => {
    push.getPushState.mockResolvedValue("off");
    push.enablePush.mockResolvedValue("on");
    api.mockResolvedValue({ sent: 1 });
    render(<PushSettings isTeacher={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "通知をオンにする" }));
    expect(push.enablePush).toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "テスト通知を送る" }));
    expect(api).toHaveBeenCalledWith("POST", "/push/test");
    expect(await screen.findByText(/テスト通知を送りました/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "オフにする" })).toBeInTheDocument();
  });

  it("[STK-14] 通知を使えないブラウザでは、iPhone はホーム画面に追加すると使えることを伝える", async () => {
    push.getPushState.mockResolvedValue("unsupported");
    render(<PushSettings isTeacher={false} />);
    expect(await screen.findByText(/ホーム画面に追加したアイコンから開くと使えます/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "通知をオンにする" })).not.toBeInTheDocument();
  });

  it("ブロックされているときは、許可し直す方法を出す", async () => {
    push.getPushState.mockResolvedValue("denied");
    render(<PushSettings isTeacher={false} />);
    expect(await screen.findByText(/通知がブロックされています/)).toBeInTheDocument();
  });
});

describe("ホームの案内", () => {
  it("[STK-14] オフの生徒に案内を出し、「あとで」で隠す", async () => {
    push.getPushState.mockResolvedValue("off");
    const { unmount } = render(<PushPrompt />);
    await userEvent.click(await screen.findByRole("button", { name: "あとで" }));
    expect(screen.queryByText(/毎日のお知らせをオンにしよう/)).not.toBeInTheDocument();
    unmount();
    render(<PushPrompt />);
    await Promise.resolve();
    expect(screen.queryByText(/毎日のお知らせをオンにしよう/)).not.toBeInTheDocument();
  });

  it("オンの端末では案内を出さず、サーバーの登録をそろえる", async () => {
    push.getPushState.mockResolvedValue("on");
    render(<PushPrompt />);
    await vi.waitFor(() => expect(push.resyncPush).toHaveBeenCalled());
    expect(screen.queryByText(/毎日のお知らせをオンにしよう/)).not.toBeInTheDocument();
  });
});
