
-- Adiciona novos status ao enum de fatura
DO $$
DECLARE
  enum_name text;
BEGIN
  SELECT t.typname INTO enum_name
  FROM pg_type t
  JOIN pg_attribute a ON a.atttypid = t.oid
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE c.relname = 'credit_card_invoices' AND a.attname = 'status' AND t.typtype = 'e';

  IF enum_name IS NOT NULL THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''parcial''', enum_name);
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS ''vencida''', enum_name);
  END IF;
END $$;
