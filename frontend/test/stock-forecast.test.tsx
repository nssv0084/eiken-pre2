import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildForecast } from "../../shared/stock";
import { StockForecastCard } from "../src/pages/admin/StockForecast";

const forecastAt = (cycle: number, day: number, alertDays = 7) =>
  buildForecast({
    grade: "pre2",
    deliverable: { vocab: 197, conversation: 79, cloze: 10, reading: 7 },
    progresses: [{ cycle, day }],
    alertDays,
  });

const renderCard = (f: ReturnType<typeof forecastAt>) =>
  render(
    <MemoryRouter>
      <StockForecastCard forecast={f} leadName="けん" />
    </MemoryRouter>,
  );

describe("在庫の見通しの表示", () => {
  it("[STK-04] 形式ごとに在庫・あと何日分・足りない数・作る数の目安を表示する", () => {
    renderCard(forecastAt(1, 1));
    const row = screen.getByText("語彙・熟語").closest("tr")!;
    expect(within(row).getByText("197")).toBeInTheDocument();
    expect(within(row).getByText("14日分")).toBeInTheDocument();
    expect(within(row).getByText("142")).toBeInTheDocument();
    expect(within(row).getByText("157（6回に分けて）")).toBeInTheDocument();
    expect(screen.getByText(/けん さん（1周目 1日目）/)).toBeInTheDocument();
  });

  it("[STK-08] 警告日数より少ない形式に警告を付ける", () => {
    renderCard(forecastAt(1, 1, 15));
    expect(within(screen.getByText("語彙・熟語").closest("tr")!).getByText("⚠")).toBeInTheDocument();
    expect(within(screen.getByText("会話文").closest("tr")!).queryByText("⚠")).not.toBeInTheDocument();
  });

  it("[STK-07] 2周目以降は上限の見積りであることを明記する", () => {
    renderCard(forecastAt(2, 5));
    expect(screen.getByText(/実際の不足はこれより少なくなります/)).toBeInTheDocument();
  });

  it("[STK-07] 1周目では注記を出さない", () => {
    renderCard(forecastAt(1, 1));
    expect(screen.queryByText(/実際の不足はこれより少なくなります/)).not.toBeInTheDocument();
  });

  it("[STK-11] 生徒がいなければ追加を促す", () => {
    renderCard(null);
    expect(screen.getByText("生徒を追加すると表示されます。")).toBeInTheDocument();
  });
});
