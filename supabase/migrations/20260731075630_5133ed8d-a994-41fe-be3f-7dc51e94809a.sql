CREATE OR REPLACE FUNCTION public.categories_guard_parent_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
BEGIN
  SELECT parent_id INTO v_parent FROM public.categories WHERE id = NEW.category_id;
  IF v_parent IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.category_companies cc
       WHERE cc.category_id = v_parent AND cc.company_id = NEW.company_id
     ) THEN
    RAISE EXCEPTION 'A categoria-pai não está vinculada a esta empresa'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_category_companies_parent_guard ON public.category_companies;
CREATE TRIGGER trg_category_companies_parent_guard
BEFORE INSERT OR UPDATE ON public.category_companies
FOR EACH ROW EXECUTE FUNCTION public.categories_guard_parent_company();

CREATE OR REPLACE FUNCTION public.categories_guard_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    IF EXISTS (
      SELECT 1
      FROM public.category_companies cc
      WHERE cc.category_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM public.category_companies pcc
          WHERE pcc.category_id = NEW.parent_id
            AND pcc.company_id = cc.company_id
        )
    ) THEN
      RAISE EXCEPTION 'A categoria-pai escolhida não pertence à(s) mesma(s) empresa(s) da categoria'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_parent_scope_guard ON public.categories;
CREATE TRIGGER trg_categories_parent_scope_guard
BEFORE INSERT OR UPDATE OF parent_id ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.categories_guard_parent_scope();