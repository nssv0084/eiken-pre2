# 講師アカウントを作成する（初回のみ。以降は管理画面から追加できる）
# 例: .\scripts\create-teacher.ps1 -Username sensei -Nickname "先生" -TempPassword "Temp1234"
param(
  [Parameter(Mandatory = $true)][string]$Username,
  [Parameter(Mandatory = $true)][string]$Nickname,
  [Parameter(Mandatory = $true)][string]$TempPassword,
  [string]$AwsProfile = "eiken",
  [string]$Region = "ap-northeast-1"
)
$ErrorActionPreference = "Stop"

npm run check-account -w infra --silent
if ($LASTEXITCODE -ne 0) { exit 1 }

$poolId = aws cloudformation describe-stacks --stack-name EikenApp --profile $AwsProfile --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text
if (-not $poolId) { throw "EikenApp スタックの UserPoolId が見つかりません。先にデプロイしてください。" }

aws cognito-idp admin-create-user --user-pool-id $poolId --username $Username `
  --temporary-password $TempPassword --message-action SUPPRESS `
  --user-attributes Name=nickname,Value=$Nickname `
  --profile $AwsProfile --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { exit 1 }

aws cognito-idp admin-add-user-to-group --user-pool-id $poolId --username $Username --group-name teachers `
  --profile $AwsProfile --region $Region
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "講師アカウント $Username を作成しました。初回ログイン時にパスワードの変更を求められます。"
