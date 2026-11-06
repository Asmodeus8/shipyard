variable "name" {
  type = string
}

variable "keep_images" {
  type    = number
  default = 30
}

variable "force_delete" {
  description = "Allow terraform destroy to remove a repository that still holds images"
  type        = bool
  default     = true
}
