output "region" {
  value = var.region
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "jenkins_user" {
  value = var.create_jenkins_user ? aws_iam_user.jenkins[0].name : null
}
