-- 1) Garantir que o vínculo de owner seja criado ANTES dos gatilhos de seed
DROP TRIGGER IF EXISTS trigger_auto_add_company_owner ON public.companies;
CREATE TRIGGER a_auto_add_company_owner
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.auto_add_company_owner();

-- 2) Seed de documentos: aceitar também o dono do registro da empresa
CREATE OR REPLACE FUNCTION public.dp_documento_requisitos_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.dp_documento_requisitos_seed(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dp_documento_requisitos_seed_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;