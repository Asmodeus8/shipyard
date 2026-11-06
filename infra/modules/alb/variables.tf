variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "target_port" {
  type = number
}

variable "health_check_path" {
  type    = string
  default = "/healthz"
}

variable "certificate_arn" {
  description = "ACM certificate ARN; when set, HTTPS is served and HTTP redirects to it"
  type        = string
  default     = null
}

variable "deletion_protection" {
  type    = bool
  default = false
}
