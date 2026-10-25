import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { AppConfig } from "../config";

export class GithubStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: AppConfig }) {
    super(scope, id, props);
    const { config } = props;

    const provider = new iam.OpenIdConnectProvider(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    // environment "production"（手動承認つき）のジョブだけが引き受けられる
    const role = new iam.Role(this, "DeployRole", {
      roleName: "eiken-github-deploy",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `${config.githubSubjectPrefix}:environment:production`,
        },
      }),
    });

    // CDK のデプロイは、ブートストラップが作った専用ロールを引き受けて行う。このロール自体は他の権限を持たない
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    // 承認の前に変更点（cdk diff）を出すためのロール。main のジョブだけが引き受けられ、
    // CDK の読み取り用ロール（lookup role）しか引き受けられないので、何も変更できない
    const planRole = new iam.Role(this, "PlanRole", {
      roleName: "eiken-github-plan",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `${config.githubSubjectPrefix}:ref:refs/heads/main`,
        },
      }),
    });
    planRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*-lookup-role-*`],
      }),
    );
  }
}
