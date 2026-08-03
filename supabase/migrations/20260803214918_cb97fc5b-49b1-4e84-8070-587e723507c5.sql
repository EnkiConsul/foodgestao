ALTER TABLE public.chart_account_templates
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS template_version text NOT NULL DEFAULT 'food_service_v2',
  ADD COLUMN IF NOT EXISTS usage_description text,
  ADD COLUMN IF NOT EXISTS included_category_examples text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_category_examples text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_category_subtypes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_transaction_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_context text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_dynamic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_reducer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dre_line text;

CREATE UNIQUE INDEX IF NOT EXISTS chart_account_templates_template_key_key
  ON public.chart_account_templates (template_key)
  WHERE template_key IS NOT NULL;

ALTER TABLE public.chart_accounts
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS template_version text,
  ADD COLUMN IF NOT EXISTS usage_description text,
  ADD COLUMN IF NOT EXISTS included_category_examples text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_category_examples text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_category_subtypes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_transaction_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_dynamic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_reducer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dre_line text;

CREATE INDEX IF NOT EXISTS chart_accounts_template_key_idx
  ON public.chart_accounts (user_id, context, template_key);