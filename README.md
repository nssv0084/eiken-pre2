# 英検準2級トレーニング

個人塾向けの英検準2級（筆記）学習 Web アプリ。

- 要件: [docs/requirements.md](docs/requirements.md)
- 画面一覧: [docs/screens.md](docs/screens.md)
- データ設計: [docs/data-model.md](docs/data-model.md)

## 構成

| ディレクトリ | 内容 |
|---|---|
| `shared/` | 画面と API で共通の型、カリキュラム定義、日付計算 |
| `backend/` | Lambda（API）。テストは `backend/test/` |
| `frontend/` | 画面（React + Vite） |
| `infra/` | AWS CDK。デプロイ先は `infra/config.ts` |
| `scripts/` | 運用スクリプト |

## 初回セットアップ

1. アプリ用 AWS アカウントの認証情報を、プロファイル名 `eiken` で登録する（`aws configure sso` または `aws configure --profile eiken`）。
2. `infra/config.ts` に次の値を入れる。
   - `accountId`: アプリ用アカウントの12桁の ID
   - `hostedZoneId`: `aws route53 list-hosted-zones-by-name --dns-name ikehiroki.com --profile eiken` の結果の `/hostedzone/` より後ろ
   - `alertEmail`: 予算アラートとエラー通知の送り先（任意）
3. 依存パッケージを入れる: `npm install`
4. CDK のブートストラップ（東京と us-east-1 の2リージョン。初回のみ）: `npm run bootstrap -w infra`
5. デプロイ: `npm run deploy`
6. 講師アカウントを作る: `.\scripts\create-teacher.ps1 -Username sensei -Nickname "先生" -TempPassword "Temp1234"`
7. `https://eiken.ikehiroki.com` を開き、仮パスワードでログインして自分のパスワードを設定する。

`deploy`・`diff`・`bootstrap` は、最初にプロファイル `eiken` のアカウントが `config.ts` の `accountId` と一致するか確認し、違えば中止する。

## 開発

```powershell
npm run typecheck   # 型チェック
npm test            # テスト
npm run dev         # 画面をローカルで起動（http://localhost:5173）
```

ローカルで画面を動かすには、デプロイ済みの環境の値で `frontend/public/config.json` を作る（Git には含めない）。値はスタックの出力（`UserPoolId`、`UserPoolClientId`、`ApiUrl`）から取れる。

```json
{
  "region": "ap-northeast-1",
  "userPoolId": "ap-northeast-1_xxxxxxxxx",
  "userPoolClientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "apiUrl": "https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com"
}
```
