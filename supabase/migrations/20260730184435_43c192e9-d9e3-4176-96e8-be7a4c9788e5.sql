ALTER TABLE public.pluggy_staging_transactions
  ADD COLUMN IF NOT EXISTS provider_id TEXT;

UPDATE public.pluggy_staging_transactions
SET provider_id = raw->>'providerId'
WHERE provider_id IS NULL AND raw ? 'providerId' AND NULLIF(raw->>'providerId','') IS NOT NULL;

-- Marca versões repetidas (mesmo lançamento do banco reprocessado pelo Pluggy)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, pluggy_account_id, provider_id
           ORDER BY (status = 'confirmed') DESC, created_at ASC
         ) AS rn
  FROM public.pluggy_staging_transactions
  WHERE provider_id IS NOT NULL AND status <> 'duplicate'
)
UPDATE public.pluggy_staging_transactions t
SET status = 'duplicate', updated_at = now()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pluggy_staging_provider_uniq
  ON public.pluggy_staging_transactions (company_id, pluggy_account_id, provider_id)
  WHERE provider_id IS NOT NULL AND status <> 'duplicate';

CREATE INDEX IF NOT EXISTS pluggy_staging_provider_lookup
  ON public.pluggy_staging_transactions (company_id, pluggy_account_id, provider_id);