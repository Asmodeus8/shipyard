#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <plan|apply|destroy|output> <environment> [image_tag]" >&2
  exit 2
}

ACTION="${1:-}"
ENVIRONMENT="${2:-}"
IMAGE_TAG="${3:-${IMAGE_TAG:-}}"
[[ -n "$ACTION" && -n "$ENVIRONMENT" ]] || usage

: "${TF_STATE_BUCKET:?TF_STATE_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"
TF="${TERRAFORM:-terraform}"
STACK="infra/stack"
VARS="../envs/${ENVIRONMENT}.tfvars"
REPOSITORY="${GITHUB_REPOSITORY:-${REPOSITORY:-unknown}}"

cd "$(dirname "$0")/.."
[[ -f "infra/envs/${ENVIRONMENT}.tfvars" ]] || { echo "No infra/envs/${ENVIRONMENT}.tfvars" >&2; exit 1; }

$TF -chdir="$STACK" init -input=false -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}" >/dev/null

tf_vars=(-var-file="$VARS" -var="region=${AWS_REGION}" -var="repository=${REPOSITORY}")

case "$ACTION" in
  plan)
    [[ -n "$IMAGE_TAG" ]] || usage
    $TF -chdir="$STACK" plan -input=false -lock-timeout=5m -no-color "${tf_vars[@]}" \
      -var="image_tag=${IMAGE_TAG}" -out=tfplan
    ;;
  apply)
    [[ -n "$IMAGE_TAG" ]] || usage
    $TF -chdir="$STACK" apply -input=false -lock-timeout=5m -auto-approve "${tf_vars[@]}" \
      -var="image_tag=${IMAGE_TAG}"
    $TF -chdir="$STACK" output -json > tf-outputs.json
    ;;
  destroy)
    $TF -chdir="$STACK" destroy -input=false -lock-timeout=5m -auto-approve "${tf_vars[@]}" \
      -var="image_tag=${IMAGE_TAG:-destroy}"
    ;;
  output)
    $TF -chdir="$STACK" output -json
    ;;
  *)
    usage
    ;;
esac
