ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS transaction_field_settings jsonb NOT NULL DEFAULT '{}'::jsonb;