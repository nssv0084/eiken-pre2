import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as budgets from "aws-cdk-lib/aws-budgets";
import type * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import { ROUTE_KEYS } from "../../backend/src/routes";
import type { AppConfig } from "../config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface AppStackProps extends StackProps {
  config: AppConfig;
  certificate: acm.ICertificate;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { config } = props;
    const siteOrigin = `https://${config.domainName}`;

    // ---------- データ ----------
    const table = new dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      globalSecondaryIndexes: [
        {
          indexName: "gsi1",
          partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---------- 認証 ----------
    const userPool = new cognito.UserPool(this, "UserPool", {
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      signInCaseSensitive: false,
      standardAttributes: { nickname: { required: false, mutable: true } },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: false,
        requireUppercase: false,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(7),
      },
      // メールアドレスを持たないため、パスワード忘れは講師が仮パスワードを再発行する
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient("WebClient", {
      authFlows: { userSrp: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      // 生徒がスマホで頻繁にログインし直さなくて済むように長めにする
      refreshTokenValidity: Duration.days(30),
    });

    new cognito.CfnUserPoolGroup(this, "TeachersGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "teachers",
      description: "講師",
    });
    new cognito.CfnUserPoolGroup(this, "StudentsGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "students",
      description: "生徒",
    });

    // ---------- 問題の生成 ----------
    // 値は手動で登録する: aws secretsmanager put-secret-value --secret-id eiken/anthropic-api-key ...
    const anthropicSecret = new secretsmanager.Secret(this, "AnthropicApiKey", {
      secretName: "eiken/anthropic-api-key",
      description: "Anthropic API キー（問題の生成と検証に使用）",
    });

    const commonFnProps = {
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, "package-lock.json"),
      bundling: { minify: true, sourceMap: true, target: "node22" },
    };

    const generatorFn = new NodejsFunction(this, "GeneratorFn", {
      ...commonFnProps,
      entry: path.join(repoRoot, "backend/src/generator.ts"),
      timeout: Duration.minutes(15),
      // 失敗時に自動で再実行すると二重に課金されるため、再試行しない
      retryAttempts: 0,
      environment: {
        TABLE_NAME: table.tableName,
        ANTHROPIC_SECRET_ID: anthropicSecret.secretName,
        NODE_OPTIONS: "--enable-source-maps",
      },
      logGroup: new logs.LogGroup(this, "GeneratorFnLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    table.grantReadWriteData(generatorFn);
    anthropicSecret.grantRead(generatorFn);

    // ---------- API ----------
    const apiFn = new NodejsFunction(this, "ApiFn", {
      ...commonFnProps,
      entry: path.join(repoRoot, "backend/src/api.ts"),
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        GENERATOR_FN_NAME: generatorFn.functionName,
        NODE_OPTIONS: "--enable-source-maps",
      },
      logGroup: new logs.LogGroup(this, "ApiFnLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    table.grantReadWriteData(apiFn);
    generatorFn.grantInvoke(apiFn);
    // 講師の管理画面から生徒・講師のアカウントを操作する（このユーザープールだけに限定）
    userPool.grant(
      apiFn,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminEnableUser",
      "cognito-idp:AdminDisableUser",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:ListUsersInGroup",
    );

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: [siteOrigin, "http://localhost:5173"],
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.DELETE,
        ],
        maxAge: Duration.days(1),
      },
    });

    const authorizer = new HttpUserPoolAuthorizer("CognitoAuthorizer", userPool, {
      userPoolClients: [userPoolClient],
    });
    const integration = new HttpLambdaIntegration("ApiIntegration", apiFn);

    for (const key of ROUTE_KEYS) {
      const [method, routePath] = key.split(" ");
      httpApi.addRoutes({
        path: routePath,
        methods: [method as apigw.HttpMethod],
        integration,
        authorizer,
      });
    }

    // ---------- 画面の配信 ----------
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      defaultRootObject: "index.html",
      // 画面内のURL（/practice など）を直接開いても index.html を返す
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
        ttl: Duration.seconds(0),
      })),
      domainNames: [config.domainName],
      certificate: props.certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.hostedZoneName,
    });
    const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, "SiteA", { zone, recordName: config.domainName, target: aliasTarget });
    new route53.AaaaRecord(this, "SiteAAAA", { zone, recordName: config.domainName, target: aliasTarget });

    new s3deploy.BucketDeployment(this, "DeploySite", {
      destinationBucket: siteBucket,
      sources: [
        s3deploy.Source.asset(path.join(repoRoot, "frontend/dist")),
        s3deploy.Source.jsonData("config.json", {
          region: this.region,
          userPoolId: userPool.userPoolId,
          userPoolClientId: userPoolClient.userPoolClientId,
          apiUrl: httpApi.apiEndpoint,
        }),
      ],
      distribution,
      distributionPaths: ["/*"],
    });

    // ---------- 監視 ----------
    if (config.alertEmail) {
      const topic = new sns.Topic(this, "AlertTopic");
      topic.addSubscription(new subs.EmailSubscription(config.alertEmail));

      new cloudwatch.Alarm(this, "ApiErrors", {
        metric: apiFn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "API の Lambda でエラーが発生しました",
      }).addAlarmAction(new cwActions.SnsAction(topic));

      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: "eiken-app-monthly",
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: config.monthlyBudgetUsd, unit: "USD" },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: config.alertEmail }],
          },
        ],
      });
    }

    // ---------- 出力 ----------
    new CfnOutput(this, "SiteUrl", { value: siteOrigin });
    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "AnthropicSecretName", { value: anthropicSecret.secretName });
  }
}
