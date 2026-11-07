#!/usr/bin/env bash
set -euo pipefail

command -v aws >/dev/null 2>&1 || PATH="$PATH:/c/Program Files/Amazon/AWSCLIV2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/jenkins/.env"
TF="${TERRAFORM:-terraform}"
cd "$ROOT/infra/bootstrap"

if [[ -f tfplan ]]; then
  $TF apply -input=false tfplan
  rm -f tfplan
fi

user="$($TF output -raw jenkins_user)"
[[ -n "$user" && "$user" != "null" ]] || { echo "Re-run the bootstrap with -var create_jenkins_user=true" >&2; exit 1; }
bucket="$($TF output -raw state_bucket)"
read -r key secret < <(aws iam create-access-key --user-name "$user" \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

[[ -f "$ENV_FILE" ]] || cp "$ROOT/jenkins/.env.example" "$ENV_FILE"
sed -i '/^AWS_ACCESS_KEY_ID=/d;/^AWS_SECRET_ACCESS_KEY=/d;/^TF_STATE_BUCKET=/d' "$ENV_FILE"
printf 'TF_STATE_BUCKET=%s\nAWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' "$bucket" "$key" "$secret" >> "$ENV_FILE"
echo "Wrote credentials for ${user} to jenkins/.env"
