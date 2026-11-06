#!/usr/bin/env bash
set -euo pipefail

: "${ECR_REGISTRY:?ECR_REGISTRY is required, e.g. 123456789012.dkr.ecr.eu-west-1.amazonaws.com}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
ECR_REPOSITORY="${ECR_REPOSITORY:-shipyard-api}"
IMAGE="${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if aws ecr describe-images --repository-name "$ECR_REPOSITORY" --image-ids imageTag="$IMAGE_TAG" >/dev/null 2>&1; then
  echo "Image $IMAGE already exists, skipping build (tags are immutable)"
  exit 0
fi

docker build --target test -t "${ECR_REPOSITORY}:test" "$ROOT/app"

docker build \
  --build-arg APP_VERSION="$IMAGE_TAG" \
  --label org.opencontainers.image.revision="$IMAGE_TAG" \
  --label org.opencontainers.image.created="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --label org.opencontainers.image.source="${REPOSITORY_URL:-}" \
  -t "$IMAGE" \
  "$ROOT/app"

docker push "$IMAGE"
echo "Pushed $IMAGE"
