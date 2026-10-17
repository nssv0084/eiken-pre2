import { App } from "aws-cdk-lib";
import { config } from "../config";
import { AppStack } from "../lib/app-stack";
import { CertStack } from "../lib/cert-stack";
import { GithubStack } from "../lib/github-stack";

const app = new App();

// -c accountId=... / -c hostedZoneId=... はローカルでの synth 確認用。デプロイは config.ts の値で行う
const accountId: string = app.node.tryGetContext("accountId") ?? config.accountId;
const hostedZoneId: string = app.node.tryGetContext("hostedZoneId") ?? config.hostedZoneId;
if (!/^\d{12}$/.test(accountId)) throw new Error("infra/config.ts の accountId（12桁）を設定してください");
if (!hostedZoneId) throw new Error("infra/config.ts の hostedZoneId を設定してください");

const cfg = { ...config, accountId, hostedZoneId };

// CloudFront で使う証明書は us-east-1 に置く必要がある
const cert = new CertStack(app, "EikenCert", {
  env: { account: accountId, region: "us-east-1" },
  crossRegionReferences: true,
  config: cfg,
});

new AppStack(app, "EikenApp", {
  env: { account: accountId, region: config.region },
  crossRegionReferences: true,
  config: cfg,
  certificate: cert.certificate,
});

// GitHub Actions からのデプロイ用ロール。最初の1回だけ手元から `npm run deploy:github -w infra` で作る
new GithubStack(app, "EikenGithub", {
  env: { account: accountId, region: config.region },
  config: cfg,
});
