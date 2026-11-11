# Shipyard runbook

What to do when an alarm fires, how to roll back, and routine operations for `shipyard-prod` (eu-west-1).

All alarms publish to the SNS topic `shipyard-prod-alerts` on ALARM and on OK. Alarm emails are configured through `alarm_emails` in [`infra/envs/prod.tfvars`](../infra/envs/prod.tfvars).

## First five minutes

1. **Is it user-facing?** `curl -s <service_url>/api/version`. A JSON reply means the ALB is serving.
2. **Did something just ship?** Check the latest run of the [pipeline](https://github.com/Asmodeus8/shipyard/actions/workflows/pipeline.yml) and the Jenkins job. Most incidents follow a deploy.
3. **Open the dashboard** (`terraform output dashboard_url`). It shows requests, errors, latency, healthy targets and the newest error logs on one screen.
4. **If a deploy caused it, roll back first and investigate after** (see [Roll back](#roll-back)).

## Alarms

| Alarm | Fires when | Likely cause | First checks | Fix |
|---|---|---|---|---|
| `no-healthy-hosts` | Healthy targets < 1 for 2 min (missing data counts) | Every task is failing its health check, or the service has 0 tasks | `aws ecs describe-services --cluster shipyard-prod --services shipyard-prod --query 'services[0].events[:5]'` | Roll back. If no deploy happened, check the stopped tasks' `stoppedReason` |
| `unhealthy-hosts` | Any unhealthy target for 2 min | One task is crashing or stuck | Target health in the console; the task's logs | ECS replaces it on its own. If it keeps recurring, read the logs, then roll back |
| `alb-target-5xx` | > 5 target 5xx in 5 min | Application errors | Dashboard log table, or the query below | Roll back if it started with a deploy |
| `app-errors` | > 5 logged 5xx/fatal in 5 min | Same as above, counted from the app's own logs | `fields @timestamp, path, status, msg \| filter status >= 500 or level = "fatal" \| sort @timestamp desc` | As above |
| `latency-p95` | p95 > 1 s for 3 min | Saturation, or a slow path | Saved query `shipyard-prod/slow-requests`; CPU and running tasks | Autoscaling adds tasks. Raise `max_tasks` if it is already at the limit |
| `cpu-high` / `memory-high` | > 85 % for 5 min | Autoscaling is at its maximum | Running task count vs `max_tasks` | Raise `max_tasks` or `task_cpu`/`task_memory` in `prod.tfvars`, then deploy |

ECS also has a deployment circuit breaker. If new tasks fail their health checks during a rollout, ECS restores the previous task definition on its own and the pipeline fails at "wait for steady state". If that happens, the release is already rolled back: fix the problem and push again.

## Roll back

Redeploy an earlier release, using its commit SHA:

```bash
gh workflow run rollback -R Asmodeus8/shipyard -f release=<sha>
```

The workflow checks that the image exists in ECR, applies Terraform with that tag and smoke-tests the live URL. The next push to `main` rolls forward again. To find the last good SHA, use the release shown in the console or the pipeline's run history.

## Routine operations

**Rotate the Jenkins deploy key** (do it every 90 days, or at once if the key may have leaked):

```bash
aws iam create-access-key --user-name shipyard-jenkins          # new key
# put the new key in jenkins/.env, then: docker compose -f jenkins/docker-compose.yml up -d
aws iam list-access-keys --user-name shipyard-jenkins
aws iam delete-access-key --user-name shipyard-jenkins --access-key-id <old-key-id>
```

GitHub Actions uses OIDC and has no key to rotate.

**Scale by hand.** Change `min_tasks` or `max_tasks` in `infra/envs/prod.tfvars` and push. Don't change it in the console: the next apply would undo it.

**Test the alarm path** without touching traffic:

```bash
aws cloudwatch set-alarm-state --alarm-name shipyard-prod-alb-target-5xx \
  --state-value ALARM --state-reason "Alarm drill"
```

The SNS topic sends the ALARM notification, and the alarm returns to OK at its next evaluation.

**Tear down.** Run the `destroy` workflow and type the environment name to confirm.
