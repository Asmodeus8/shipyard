variable "name" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "service_name" {
  type = string
}

variable "log_group_name" {
  type = string
}

variable "alb_arn_suffix" {
  type = string
}

variable "target_group_arn_suffix" {
  type = string
}

variable "alarm_emails" {
  description = "Each address receives a confirmation email from SNS before alerts are delivered"
  type        = list(string)
  default     = []
}

variable "error_threshold" {
  type    = number
  default = 5
}

variable "latency_p95_threshold_seconds" {
  type    = number
  default = 1
}
