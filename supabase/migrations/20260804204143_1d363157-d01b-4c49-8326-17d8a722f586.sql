ALTER TABLE public.pluggy_staging_transactions
  ADD COLUMN IF NOT EXISTS counterparty_document text,
  ADD COLUMN IF NOT EXISTS counterparty_document_type text;

ALTER TABLE public.banks
  ADD COLUMN IF NOT EXISTS tax_id text;

UPDATE public.banks SET tax_id = v.tax_id
FROM (VALUES
  ('banco-do-brasil', '00.000.000/0001-91'),
  ('bb', '00.000.000/0001-91'),
  ('caixa', '00.360.305/0001-04'),
  ('caixa-economica-federal', '00.360.305/0001-04'),
  ('bradesco', '60.746.948/0001-12'),
  ('itau', '60.701.190/0001-04'),
  ('itau-unibanco', '60.701.190/0001-04'),
  ('santander', '90.400.888/0001-42'),
  ('nubank', '18.236.120/0001-58'),
  ('inter', '00.416.968/0001-01'),
  ('banco-inter', '00.416.968/0001-01'),
  ('c6', '31.872.495/0001-72'),
  ('c6-bank', '31.872.495/0001-72'),
  ('sicoob', '02.038.232/0001-64'),
  ('sicredi', '01.181.521/0001-55'),
  ('safra', '58.160.789/0001-28'),
  ('banrisul', '92.702.067/0001-96'),
  ('btg', '30.306.294/0001-45'),
  ('btg-pactual', '30.306.294/0001-45'),
  ('original', '92.894.922/0001-08'),
  ('pagbank', '08.561.701/0001-01'),
  ('pagseguro', '08.561.701/0001-01'),
  ('mercado-pago', '10.573.521/0001-91'),
  ('stone', '16.501.555/0001-57'),
  ('banco-da-amazonia', '04.902.979/0001-44'),
  ('bnb', '07.237.373/0001-20'),
  ('brb', '00.000.208/0001-00'),
  ('daycoval', '62.232.889/0001-90'),
  ('sofisa', '60.889.128/0001-80'),
  ('abc-brasil', '28.195.667/0001-06')
) AS v(slug, tax_id)
WHERE public.banks.slug = v.slug AND public.banks.tax_id IS NULL;