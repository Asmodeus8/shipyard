output "service_url" {
  value = module.alb.url
}

output "cluster_name" {
  value = module.service.cluster_name
}

output "service_name" {
  value = module.service.service_name
}

output "log_group_name" {
  value = module.service.log_group_name
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${module.monitoring.dashboard_name}"
}

output "alerts_topic_arn" {
  value = module.monitoring.sns_topic_arn
}

output "image" {
  value = "${data.aws_ecr_repository.app.repository_url}:${var.image_tag}"
}
