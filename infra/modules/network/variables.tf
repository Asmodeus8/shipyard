variable "name" {
  type = string
}

variable "cidr_block" {
  type    = string
  default = "10.0.0.0/16"
}

variable "az_count" {
  type    = number
  default = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3 (the ALB needs at least two AZs)."
  }
}

variable "single_nat_gateway" {
  description = "One shared NAT gateway (cheaper) instead of one per AZ (survives an AZ outage)"
  type        = bool
  default     = true
}

variable "enable_flow_logs" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 30
}
