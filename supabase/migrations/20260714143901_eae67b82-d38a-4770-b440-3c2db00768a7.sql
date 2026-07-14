
-- 1) Backfill template_code para categorias legadas (USR-####, sequencial por user_id)
WITH numbered AS (
  SELECT id, user_id,
    'USR-' || LPAD(ROW_NUMBER() OVER (
      PARTITION BY user_id ORDER BY created_at, id
    )::text, 4, '0') AS new_code
  FROM public.categories
  WHERE template_code IS NULL
)
UPDATE public.categories c
SET template_code = n.new_code
FROM numbered n
WHERE c.id = n.id;

-- 2) Backfill category_subtype derivado de transaction_type
UPDATE public.categories
SET category_subtype = CASE
  WHEN transaction_type = 'receita' THEN 'receita'
  ELSE 'despesa'
END
WHERE category_subtype IS NULL;

-- 3) Trigger de auto-geração de template_code no INSERT (quando NULL)
CREATE OR REPLACE FUNCTION public.categories_autogen_template_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
BEGIN
  IF NEW.template_code IS NULL OR btrim(NEW.template_code) = '' THEN
    SELECT COALESCE(MAX(
      NULLIF(substring(template_code FROM '^USR-(\d+)$'), '')::int
    ), 0) + 1
    INTO _next
    FROM public.categories
    WHERE user_id = NEW.user_id
      AND template_code ~ '^USR-\d+$';

    NEW.template_code := 'USR-' || LPAD(_next::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_autogen_template_code ON public.categories;
CREATE TRIGGER trg_categories_autogen_template_code
BEFORE INSERT ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.categories_autogen_template_code();

-- 4) Trigger de imutabilidade do template_code no UPDATE
CREATE OR REPLACE FUNCTION public.categories_protect_template_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.template_code IS NOT NULL
     AND NEW.template_code IS DISTINCT FROM OLD.template_code THEN
    RAISE EXCEPTION 'ID Interno (template_code) não pode ser alterado após definido — preserva o histórico dos lançamentos.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_protect_template_code ON public.categories;
CREATE TRIGGER trg_categories_protect_template_code
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.categories_protect_template_code();

-- 5) Trigger de obrigatoriedade do category_subtype
CREATE OR REPLACE FUNCTION public.categories_require_subtype()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.category_subtype IS NULL OR btrim(NEW.category_subtype::text) = '' THEN
    RAISE EXCEPTION 'Subtipo é obrigatório (Receita, Saída, Custo, Despesa, Imposto ou Investimento).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_require_subtype ON public.categories;
CREATE TRIGGER trg_categories_require_subtype
BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.categories_require_subtype();
