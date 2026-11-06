variable "name" {
  type = string
}

variable "image" {
  description = "Full image reference, e.g. <account>.dkr.ecr.<region>.amazonaws.com/repo:tag"
  type        = string
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "health_check_path" {
  type    = string
  default = "/healthz"
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "target_group_arn" {
  type = string
}

variable "alb_resource_label" {
  description = "<alb arn_suffix>/<target group arn_suffix>, used for request-count scaling"
  type        = string
}

variable "min_count" {
  type    = number
  default = 2
}

variable "max_count" {
  type    = number
  default = 6

  validation {
    condition     = var.max_count >= 1
    error_message = "max_count must be at least 1."
  }
}

variable "cpu_target_percent" {
  type    = number
  default = 60
}

variable "requests_per_task_target" {
  type    = number
  default = 500
}

variable "log_retention_days" {
  type    = number
  default = 30
}
