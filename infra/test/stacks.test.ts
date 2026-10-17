import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ROUTE_KEYS } from "../../backend/src/routes";
import { config } from "../config";
import { AppStack } from "../lib/app-stack";
import { CertStack } from "../lib/cert-stack";
import { GithubStack } from "../lib/github-stack";

// Lambda のバンドル（esbuild）を省いて、構成だけを調べる
const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
const cert = new CertStack(app, "Cert", {
  env: { account: config.accountId, region: "us-east-1" },
  crossRegionReferences: true,
  config,
});
const appStack = new AppStack(app, "App", {
  env: { account: config.accountId, region: config.region },
  crossRegionReferences: true,
  config,
  certificate: cert.certificate,
});
const github = new GithubStack(app, "Github", { env: { account: config.accountId, region: config.region }, config });

const appT = Template.fromStack(appStack);
const githubT = Template.fromStack(github);

describe("アプリのスタック", () => {
  it("[NFR-04] ルート定義の全経路が API にあり、すべて Cognito の認証つき", () => {
    const routes = appT.findResources("AWS::ApiGatewayV2::Route");
    const keys = Object.values(routes).map((r) => r.Properties.RouteKey as string);
    expect(keys.sort()).toEqual([...ROUTE_KEYS].sort());
    for (const r of Object.values(routes)) {
      expect(r.Properties.AuthorizationType).toBe("JWT");
    }
  });

  it("[NFR-05] データのテーブルとユーザープールは削除時も残り、テーブルは復元可能", () => {
    appT.hasResource("AWS::DynamoDB::GlobalTable", {
      DeletionPolicy: "Retain",
      Properties: { Replicas: Match.arrayWith([Match.objectLike({ PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } })]) },
    });
    appT.hasResource("AWS::Cognito::UserPool", { DeletionPolicy: "Retain" });
  });

  it("[NFR-04] 画面の保管先は公開されない", () => {
    appT.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("講師・生徒のグループがある", () => {
    const names = Object.values(appT.findResources("AWS::Cognito::UserPoolGroup")).map((g) => g.Properties.GroupName);
    expect(names.sort()).toEqual(["students", "teachers"]);
  });

  it("独自ドメインを CloudFront に向け、HTTP は HTTPS に転送する", () => {
    appT.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: [config.domainName],
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https" }),
      }),
    });
  });

  it("[NFR-06] 予算アラートがある", () => {
    appT.resourceCountIs("AWS::Budgets::Budget", 1);
  });

  it("[NFR-04] API キーはコードやテンプレートに書かれない", () => {
    expect(JSON.stringify(appT.toJSON())).not.toMatch(/sk-ant-/);
  });
});

describe("GitHub 連携のスタック", () => {
  it("信頼されるのは、このリポジトリの production 環境だけ", () => {
    const roles = Object.values(githubT.findResources("AWS::IAM::Role")).filter((r) => r.Properties.RoleName === "eiken-github-deploy");
    expect(roles).toHaveLength(1);
    const trust = JSON.stringify(roles[0].Properties.AssumeRolePolicyDocument);
    expect(trust).toContain(`${config.githubSubjectPrefix}:environment:production`);
    expect(trust).toContain("sts.amazonaws.com");
    expect(trust).not.toContain('"*"');
  });

  it("ロール自身の権限は、CDK のロールを引き受けることだけ", () => {
    const policies = Object.values(githubT.findResources("AWS::IAM::Policy")).filter((p) =>
      JSON.stringify(p.Properties.Roles).includes("DeployRole"),
    );
    const statements = policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
    expect(statements).toHaveLength(1);
    expect(statements[0].Action).toBe("sts:AssumeRole");
    expect(JSON.stringify(statements[0].Resource)).toContain("role/cdk-");
  });
});
