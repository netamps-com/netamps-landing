terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "cloudflare_account_id" {
  description = "The Cloudflare Account ID"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "The Cloudflare API Token for Terraform"
  type        = string
  sensitive   = true
}

variable "pages_project_name" {
  description = "The name of the Cloudflare Pages project"
  type        = string
  default     = "netamps-landing"
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# =====================================================================
# Isolation Quarantine R2 Storage Bucket Pool
# Zero-public-access quarantine sink for unverified edge ingestions
# =====================================================================
resource "cloudflare_r2_bucket" "quarantine_vault" {
  account_id = var.cloudflare_account_id
  name       = "netamps-media-quarantine"
  location   = "ENAM" # Example location, auto-routing
}

# =====================================================================
# Production R2 Media Vault Storage Pool
# Secure final target workspace tier post-inspection
# =====================================================================
resource "cloudflare_r2_bucket" "production_vault" {
  account_id = var.cloudflare_account_id
  name       = "netamps-media-production"
  location   = "ENAM"
}

# =====================================================================
# Structured SIEM Compliance Ledger (Logpush Job)
# Architectural configuration for structured audit traces
# =====================================================================
resource "cloudflare_logpush_job" "siem_audit_ledger" {
  account_id      = var.cloudflare_account_id
  name            = "netamps-media-siem-ledger"
  dataset         = "workers_trace_events"
  enabled         = true
  # Destination could be AWS S3, Datadog, Splunk, etc.
  # For demonstration, streaming to a secure logging S3 bucket
  destination_conf = "s3://netamps-siem-logs/cloudflare?region=us-east-1"
  logpull_options  = "fields=RayID,ClientIP,ClientRequestHost,ClientRequestMethod,ClientRequestURI,EdgeStartTimestamp,WorkerCPUTime,WorkerStatus,EventTimestampMs,EventLevel,EventMessage"
}

# =====================================================================
# Worker Event Bindings Code Map
# (Applied via Pages project deployment configuration for full-stack)
# =====================================================================
# In a standard worker, we'd bind it in cloudflare_worker_script.
# Since this is a Cloudflare Pages project, bindings are maintained 
# in wrangler.toml or via the pages_project resource.
resource "cloudflare_pages_project" "netamps_landing" {
  account_id = var.cloudflare_account_id
  name       = var.pages_project_name
  production_branch = "main"

  # We apply the R2 bucket bindings mapping namespace for the edge script
  deployment_configs {
    production {
      r2_buckets = {
        QUARANTINE_BUCKET = cloudflare_r2_bucket.quarantine_vault.name
        PRODUCTION_BUCKET = cloudflare_r2_bucket.production_vault.name
      }
      environment_variables = {
        NODE_VERSION = "20"
        SIEM_ENABLED = "true"
      }
    }
    preview {
      r2_buckets = {
        QUARANTINE_BUCKET = cloudflare_r2_bucket.quarantine_vault.name
        PRODUCTION_BUCKET = cloudflare_r2_bucket.production_vault.name
      }
      environment_variables = {
        NODE_VERSION = "20"
      }
    }
  }
}
