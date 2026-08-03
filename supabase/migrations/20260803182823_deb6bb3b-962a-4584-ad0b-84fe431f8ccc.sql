CREATE OR REPLACE FUNCTION public.category_templates_validate_chart_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _acc record;
  _root text;
BEGIN
  IF NEW.chart_account_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT code, name, is_synthetic INTO _acc
    FROM public.chart_account_templates
   WHERE code = NEW.chart_account_code;

  IF _acc.code IS NULL THEN
    RAISE EXCEPTION 'Conta contábil padrão % não existe.', NEW.chart_account_code
      USING ERRCODE = '22023';
  END IF;

  IF _acc.is_synthetic THEN
    RAISE EXCEPTION 'A conta % — % é sintética (agrupadora) e não recebe lançamentos. Escolha uma conta analítica.', _acc.code, _acc.name
      USING ERRCODE = '22023';
  END IF;

  _root := split_part(_acc.code, '.', 1);

  IF _root IN ('1','2','3') THEN
    RAISE EXCEPTION 'A conta % é patrimonial. Categorias só podem usar contas de resultado (Receitas, Custos, Despesas ou Impostos).', _acc.code
      USING ERRCODE = '22023';
  END IF;

  IF _root NOT IN ('4','5','6','7','8','9') THEN
    RAISE EXCEPTION 'A conta % não pertence a um grupo de resultado válido.', _acc.code
      USING ERRCODE = '22023';
  END IF;

  IF NEW.transaction_type = 'entrada' AND _root IN ('5','6','7','8') THEN
    RAISE EXCEPTION 'Categoria de Entrada não pode usar a conta % (grupo %). Use uma conta do grupo 4 — Receitas.', _acc.code, _root
      USING ERRCODE = '22023';
  END IF;

  IF NEW.transaction_type = 'saida' AND _root = '4' THEN
    RAISE EXCEPTION 'Categoria de Saída não pode usar a conta % (Receitas). Use uma conta de Custos, Despesas ou Impostos (grupos 5 a 8).', _acc.code
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_category_templates_validate_chart_account ON public.category_templates;
CREATE TRIGGER trg_category_templates_validate_chart_account
BEFORE INSERT OR UPDATE OF chart_account_code, transaction_type ON public.category_templates
FOR EACH ROW EXECUTE FUNCTION public.category_templates_validate_chart_account();