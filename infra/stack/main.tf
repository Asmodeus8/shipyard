locals {
  name = "${var.project}-${var.environment}"
}

data "aws_ecr_repository" "app" {
  name = var.ecr_repository_name
}

module "network" {
  source             = "../modules/network"
  name               = local.name
  cidr_block         = var.vpc_cidr
  az_count           = var.az_count
  single_nat_gateway = var.single_nat_gateway
  log_retention_days = var.log_retention_days
}

module "alb" {
  source              = "../modules/alb"
  name                = local.name
  vpc_id              = module.network.vpc_id
  vpc_cidr            = module.network.cidr_block
  public_subnet_ids   = module.network.public_subnet_ids
  target_port         = var.container_port
  certificate_arn     = var.certificate_arn
  deletion_protection = var.deletion_protection
}

module "service" {
  source                = "../modules/ecs-service"
  name                  = local.name
  image                 = "${data.aws_ecr_repository.app.repository_url}:${var.image_tag}"
  container_port        = var.container_port
  cpu                   = var.task_cpu
  memory                = var.task_memory
  min_count             = var.min_tasks
  max_count             = var.max_tasks
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.alb.security_group_id
  target_group_arn      = module.alb.target_group_arn
  alb_resource_label    = "${module.alb.arn_suffix}/${module.alb.target_group_arn_suffix}"
  log_retention_days    = var.log_retention_days

  environment = {
    APP_VERSION    = var.image_tag
    APP_ENV        = var.environment
    REPOSITORY_URL = var.repository == "unknown" ? "" : "https://github.com/${var.repository}"
  }
}

module "monitoring" {
  source                  = "../modules/monitoring"
  name                    = local.name
  cluster_name            = module.service.cluster_name
  service_name            = module.service.service_name
  log_group_name          = module.service.log_group_name
  alb_arn_suffix          = module.alb.arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  alarm_emails            = var.alarm_emails
}
