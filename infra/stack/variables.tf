variable "project" {
  type    = string
  default = "shipyard"
}

variable "environment" {
  type = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be lowercase, 2-16 characters."
  }
}

variable "region" {
  type = string
}

variable "repository" {
  description = "Source repository, recorded as a tag on every resource"
  type        = string
  default     = "unknown"
}

variable "ecr_repository_name" {
  type    = string
  default = "shipyard-api"
}

variable "image_tag" {
  description = "Image tag to run; CI passes the git commit SHA"
  type        = string
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "az_count" {
  type    = number
  default = 2
}

variable "single_nat_gateway" {
  type    = bool
  default = true
}

variable "task_cpu" {
  type    = number
  default = 256
}

variable "task_memory" {
  type    = number
  default = 512
}

variable "min_tasks" {
  type    = number
  default = 2
}

variable "max_tasks" {
  type    = number
  default = 6
}

variable "certificate_arn" {
  type    = string
  default = null
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "alarm_emails" {
  type    = list(string)
  default = []
}
