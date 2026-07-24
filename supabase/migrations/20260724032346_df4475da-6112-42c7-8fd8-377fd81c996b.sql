-- Add Open Finance identity fields to accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS document_last4 text;

-- Add consent expiry notification tracking to connections
ALTER TABLE public.open_finance_connections
  ADD COLUMN IF NOT EXISTS consent_notified_at timestamptz;

-- Ensure required extensions for cron + http
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;