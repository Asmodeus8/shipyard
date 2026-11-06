#!/usr/bin/env bash
set -euo pipefail

REPO="${1:?usage: $0 <github owner/repo> [region]}"
REGION="${2:-eu-west-1}"
TF="${TERRAFORM:-terraform}"
cd "$(dirname "$0")/../infra/bootstrap"

$TF init -input=false >/dev/null

extra=()
if ! $TF state list 2>/dev/null | grep -q '^aws_iam_openid_connect_provider.github'; then
  if aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text 2>/dev/null |
    grep -q token.actions.githubusercontent.com; then
    extra+=(-var="create_github_oidc_provider=false")
  fi
fi

if command -v gh >/dev/null 2>&1; then
  prefix="$(gh api "repos/${REPO}/actions/oidc/customization/sub" --jq '.sub_claim_prefix // empty' 2>/dev/null || true)"
  if [[ -n "$prefix" ]]; then
    extra+=(-var="github_subject_prefixes=[\"${prefix}\"]")
  fi
fi

$TF apply -input=false -auto-approve -var="github_repository=${REPO}" -var="region=${REGION}" "${extra[@]}"

out() { $TF output -raw "$1"; }

if command -v gh >/dev/null 2>&1; then
  gh variable set AWS_REGION --repo "$REPO" --body "$(out region)"
  gh variable set TF_STATE_BUCKET --repo "$REPO" --body "$(out state_bucket)"
  gh variable set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$(out deploy_role_arn)"
  gh variable set AWS_PLAN_ROLE_ARN --repo "$REPO" --body "$(out plan_role_arn)"
  gh api -X PUT "repos/${REPO}/environments/production" >/dev/null
  echo "GitHub variables and the 'production' environment are configured for ${REPO}"
else
  echo "gh not found; set these repository variables manually:"
  for v in region state_bucket deploy_role_arn plan_role_arn; do echo "  ${v} = $(out "$v")"; done
fi
