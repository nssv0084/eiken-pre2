// デプロイ先の固定値。別アカウントの認証情報でデプロイしようとすると CDK が止まるよう、accountId を必ず設定する
export const config = {
  // アプリ用AWSアカウントの12桁のID
  accountId: "302961875808",
  // npm スクリプト（package.json）の --profile と同じ名前にする
  awsProfile: "eiken",
  region: "ap-northeast-1",
  hostedZoneName: "ikehiroki.com",
  // aws route53 list-hosted-zones-by-name --dns-name ikehiroki.com --profile eiken で確認できる（"/hostedzone/" の後ろ）
  hostedZoneId: "Z08040743939C4B65P3YE",
  domainName: "eiken.ikehiroki.com",
  // 予算アラートと Lambda のエラー通知の送り先。空なら通知を作らない
  alertEmail: "ikehiroki@gmail.com",
  monthlyBudgetUsd: 10,
};

export type AppConfig = typeof config;
