import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hooksDir = join(import.meta.dirname, "../../.claude/hooks");
const run = (script: string, toolInput: object) =>
  spawnSync("node", [join(hooksDir, script)], { input: JSON.stringify({ tool_input: toolInput }), encoding: "utf8" });
const bash = (command: string) => run("guard-bash.mjs", { command }).status;
const write = (content: string) => run("guard-secrets.mjs", { content }).status;

// このファイル自体がシークレット検査に引っかからないよう、キーに見える文字列は結合して作る
const fakeAwsKey = "AKIA" + "ABCDEFGHIJKLMNOP";
const fakeAnthropicKey = "sk-ant-" + "api03-abcdefghijklmnopqrstuvwxyz";
const fakePrivateKey = "-----BEGIN RSA PRIVATE " + "KEY-----";
const fakeAwsSecret = "aws_secret_" + "access_key = abcdefghijklmnopqrstuvwxyz0123456789";

describe("Bash の検査（hooks）", () => {
  it.each([
    "git push --force origin main",
    "git push -f",
    "git commit --no-verify -m x",
    "npx cdk destroy EikenApp",
    "aws s3 ls --profile other",
    "AWS_PROFILE=prod aws sts get-caller-identity",
    "aws secretsmanager get-secret-value --secret-id eiken/anthropic-api-key --profile eiken",
    "aws dynamodb delete-table --table-name x",
  ])("止める: %s", (cmd) => {
    expect(bash(cmd)).toBe(2);
  });

  it.each([
    "git push origin main",
    "git push -u origin feature",
    "aws sts get-caller-identity --profile eiken",
    "npm run verify",
    "git commit -m 'fix: force push guard'",
  ])("通す: %s", (cmd) => {
    expect(bash(cmd)).toBe(0);
  });
});

describe("シークレットの検査（hooks）", () => {
  it.each([`const k = '${fakeAwsKey}'`, `ANTHROPIC=${fakeAnthropicKey}`, fakePrivateKey, fakeAwsSecret])("止める: %#", (text) => {
    expect(write(text)).toBe(2);
  });

  it("普通のコードは通す", () => {
    expect(write("export const x = 1; // sk-ant- の形式は検査する")).toBe(0);
  });
});
