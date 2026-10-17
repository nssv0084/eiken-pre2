# データ設計（DynamoDB）

- 関連: [要件定義書](requirements.md)、型定義 [shared/types.ts](../shared/types.ts)

テーブルは1つ（単一テーブル設計）。キーは `pk`（パーティションキー）と `sk`（ソートキー）。一覧の取得用に GSI を1つ（`gsi1pk`, `gsi1sk`）持つ。GSI の項目は、一覧に載せたいときだけ書き込む（スパースインデックス）。

級（grade）はキーに含める。今は `pre2` だけだが、他の級を追加してもデータが混ざらない。

## エンティティ

| エンティティ | pk | sk | gsi1pk | gsi1sk | 内容 |
|---|---|---|---|---|---|
| 出題単位（Item） | `ITEM#{itemId}` | `META` | `ITEMS#{grade}#{type}#{status}` | `{createdAt}` | 問題本体。語彙・会話文は設問1つ、長文型は本文と設問2〜4つ |
| ユーザー | `USER#{sub}` | `PROFILE` | `USERS#{role}` | `{username}` | ニックネーム、級、受験日、開始日、周回・日、連続学習日数、形式別の累計 |
| 日別の学習量 | `USER#{sub}` | `DAY#{date}` | — | — | 日別の解答数・正答数（形式別） |
| 解答履歴 | `USER#{sub}` | `ANS#{timestamp}#{questionId}` | — | — | 1回ごとの解答（選んだ番号、正誤、どこで解いたか） |
| 設問ごとの状態 | `USER#{sub}` | `QS#{questionId}` | `REVIEW#{sub}`（復習中のみ） | `{nextReviewDate}` | 解答回数、連続正解数、復習の予定日、最後に間違えた周回 |
| その日の学習 | `USER#{sub}` | `SESSION#{cycle}#{day}` | — | — | その日のセット構成（出題する設問のID）と、どこまで解いたか |
| 課題 | `ASSIGN#{assignId}` | `META` | `ASSIGNS` | `{createdAt}` | 課題名、出題する設問、期限、対象の生徒 |
| 課題の進み具合 | `USER#{sub}` | `ASSIGN#{assignId}` | — | — | 生徒ごとの解答状況 |
| 問題の報告 | `REPORT#{reportId}` | `META` | `REPORTS#{status}` | `{createdAt}` | 報告した生徒、設問、理由、コメント |
| 生成ジョブ | `JOB#{jobId}` | `META` | `JOBS` | `{createdAt}` | 形式、数、テーマ、状態、作れた数、費用 |
| API 使用額 | `USAGE` | `TOTAL` | — | — | 累計の費用（マイクロドル単位の整数） |
| API 使用記録 | `USAGE` | `LOG#{timestamp}` | — | — | 1回ごとのモデル、トークン数、費用 |
| 設定 | `SETTINGS` | `GLOBAL` | — | — | 予算、為替レート、アラート日数、抜き取り確認の割合、使用モデル |

設問 ID は `{itemId}:{番号}` とする。長文型でも設問ごとに正誤と復習を管理できる。

## 主な読み方

| 用途 | 読み方 |
|---|---|
| 出題できる問題の一覧 | GSI `ITEMS#{grade}#{type}#approved` を Query |
| 講師の確認待ち | GSI `ITEMS#{grade}#{type}#review` と `REPORTS#open` を Query |
| 生徒一覧（講師ダッシュボード） | GSI `USERS#student` を Query（プロフィールに集計値を持たせ、1回で表示できるようにする） |
| 今日の復習 | GSI `REVIEW#{sub}` を `gsi1sk <= 今日` で Query |
| 解いたことのある設問 | `USER#{sub}` を `begins_with(sk, "QS#")` で Query |
| 日別グラフ | `USER#{sub}` を `begins_with(sk, "DAY#")` で Query |

## 出題単位の状態（status）

| 状態 | 意味 | 生徒に出すか |
|---|---|---|
| `pending` | AI 検証の待ち | 出さない |
| `approved` | 出題対象 | 出す |
| `review` | 講師の抜き取り確認の対象（AI 検証には合格） | 出す |
| `reported` | 生徒から報告があり講師の確認待ち | 出さない |
| `disabled` | 無効化（AI 検証の不合格、講師が無効化） | 出さない |

`review` の問題は出題するが、講師の確認待ちの一覧に表示する（要件 3.2 の抜き取り確認）。そのため出題時は GSI を `approved` と `review` の2回 Query する。

## バックアップと削除

- ポイントインタイムリカバリを有効にする。
- テーブルはスタックを削除しても残す（RemovalPolicy.RETAIN）。
- 生徒を削除するときは、Cognito のユーザーと `USER#{sub}` の項目をすべて削除する。
