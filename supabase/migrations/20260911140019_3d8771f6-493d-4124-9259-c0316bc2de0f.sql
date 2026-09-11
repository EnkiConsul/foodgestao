-- Reintegração: limpa as ressalvas guardadas na tabela restrita
CREATE OR REPLACE FUNCTION public.dp_colaborador_desligamento_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias integer;
BEGIN
  IF NEW.ativo = false AND NEW.data_desligamento IS NULL THEN
    RAISE EXCEPTION 'Informe a data de demissão para desligar o colaborador';
  END IF;

  IF NEW.data_desligamento IS NOT NULL THEN
    NEW.ativo := false;
    SELECT COALESCE(dias_carencia_portal, 30) INTO v_dias
      FROM public.dp_pendencias_config WHERE company_id = NEW.company_id;
    v_dias := COALESCE(v_dias, 30);
    IF NEW.acesso_portal_ate IS NULL
       OR TG_OP = 'UPDATE' AND COALESCE(OLD.data_desligamento, '1900-01-01'::date) IS DISTINCT FROM NEW.data_desligamento THEN
      NEW.acesso_portal_ate := NEW.data_desligamento + v_dias;
    END IF;
    IF NEW.desligado_em IS NULL THEN
      NEW.desligado_em := now();
      NEW.desligado_por := COALESCE(NEW.desligado_por, auth.uid());
    END IF;
  ELSE
    NEW.ativo := COALESCE(NEW.ativo, true);
    NEW.acesso_portal_ate := NULL;
    NEW.motivo_desligamento := NULL;
    NEW.desligado_em := NULL;
    NEW.desligado_por := NULL;
    DELETE FROM public.dp_colaborador_desligamento_restrito WHERE colaborador_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_set_desligamento_ressalvas(uuid, text, public.dp_elegibilidade_recontratacao) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_set_desligamento_ressalvas(uuid, text, public.dp_elegibilidade_recontratacao) TO authenticated, service_role;

ALTER TABLE public.dp_colaboradores
  DROP COLUMN observacao_desligamento,
  DROP COLUMN elegivel_recontratacao;