
-- 1) Harden dp_colaborador_of: match by user_id only
CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id
  FROM public.dp_colaboradores c
  WHERE c.ativo = true
    AND c.user_id = _user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.companies co
      WHERE co.id = c.company_id AND co.user_id = _user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = c.company_id
        AND m.user_id = _user_id
        AND m.role IN ('owner','admin')
    )
  LIMIT 1;
$function$;

-- 2) Anti-abuse trigger on dp_cadastro_solicitacoes
CREATE OR REPLACE FUNCTION public.dp_cadastro_solicitacoes_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf_digits text;
  v_recent_by_cpf int;
  v_recent_by_company int;
BEGIN
  -- Basic field-level validation (defense in depth vs client)
  IF NEW.nome IS NULL OR length(btrim(NEW.nome)) < 3 OR length(NEW.nome) > 120 THEN
    RAISE EXCEPTION 'Nome inválido';
  END IF;

  v_cpf_digits := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
  IF length(v_cpf_digits) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;
  NEW.cpf := v_cpf_digits;

  IF NEW.email IS NOT NULL AND NEW.email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF NEW.email IS NOT NULL AND length(NEW.email) > 255 THEN
    RAISE EXCEPTION 'E-mail muito longo';
  END IF;

  IF NEW.telefone IS NOT NULL AND length(regexp_replace(NEW.telefone, '\D', '', 'g')) NOT BETWEEN 10 AND 13 THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  IF NEW.observacoes IS NOT NULL AND length(NEW.observacoes) > 1000 THEN
    RAISE EXCEPTION 'Observações excedem 1000 caracteres';
  END IF;

  -- Rate limit: same CPF cannot spam a company
  SELECT count(*) INTO v_recent_by_cpf
  FROM public.dp_cadastro_solicitacoes
  WHERE company_id = NEW.company_id
    AND cpf = NEW.cpf
    AND created_at > now() - interval '1 hour';
  IF v_recent_by_cpf >= 3 THEN
    RAISE EXCEPTION 'Muitas solicitações recentes para este CPF. Tente novamente mais tarde.';
  END IF;

  -- Rate limit: total submissions per company per hour
  SELECT count(*) INTO v_recent_by_company
  FROM public.dp_cadastro_solicitacoes
  WHERE company_id = NEW.company_id
    AND created_at > now() - interval '1 hour';
  IF v_recent_by_company >= 20 THEN
    RAISE EXCEPTION 'Limite de solicitações por hora atingido para esta empresa. Tente novamente mais tarde.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_cadastro_solicitacoes_guard ON public.dp_cadastro_solicitacoes;
CREATE TRIGGER trg_dp_cadastro_solicitacoes_guard
BEFORE INSERT ON public.dp_cadastro_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.dp_cadastro_solicitacoes_guard();
