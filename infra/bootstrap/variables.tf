variable "project" {
  type    = string
  default = "shipyard"
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to assume the CI roles"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use the form owner/name."
  }
}

variable "create_github_oidc_provider" {
  description = "Set false if the account already has the GitHub OIDC provider"
  type        = bool
  default     = true
}

variable "create_jenkins_user" {
  description = "Create an IAM user with the deploy policy for Jenkins (access keys are created outside Terraform)"
  type        = bool
  default     = false
}
