ALTER TYPE public.transaction_type RENAME VALUE 'receita' TO 'entrada';
ALTER TYPE public.transaction_type RENAME VALUE 'despesa' TO 'saida';
ALTER TYPE public.transaction_type RENAME VALUE 'parcelado' TO 'parcelamento';

ALTER TABLE public.categories ALTER COLUMN transaction_type SET DEFAULT 'saida'::public.transaction_type;

ALTER TABLE public.categorization_rules DROP CONSTRAINT IF EXISTS categorization_rules_transaction_type_check;
UPDATE public.categorization_rules SET transaction_type = 'entrada' WHERE transaction_type = 'receita';
UPDATE public.categorization_rules SET transaction_type = 'saida' WHERE transaction_type = 'despesa';
ALTER TABLE public.categorization_rules
  ADD CONSTRAINT categorization_rules_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY['entrada'::text, 'saida'::text]));