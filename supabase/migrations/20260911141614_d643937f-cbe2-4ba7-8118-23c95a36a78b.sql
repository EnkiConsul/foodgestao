ALTER TABLE public.dp_colaborador_desligamento_restrito
  ADD COLUMN IF NOT EXISTS data_desligamento date,
  ADD COLUMN IF NOT EXISTS encerrado_em timestamptz;

UPDATE public.dp_colaborador_desligamento_restrito r
SET data_desligamento = c.data_desligamento
FROM public.dp_colaboradores c
WHERE c.id = r.colaborador_id AND r.data_desligamento IS NULL;

ALTER TABLE public.dp_colaborador_desligamento_restrito
  DROP CONSTRAINT IF EXISTS dp_colaborador_desligamento_restrito_colaborador_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS dp_deslig_restrito_ciclo_aberto
  ON public.dp_colaborador_desligamento_restrito (colaborador_id)
  WHERE encerrado_em IS NULL;

CREATE INDEX IF NOT EXISTS dp_deslig_restrito_colab_idx
  ON public.dp_colaborador_desligamento_restrito (colaborador_id, created_at DESC);

-- Grava sempre no ciclo aberto; ciclos encerrados ficam no histórico.
CREATE OR REPLACE FUNCTION public.dp_set_desligamento_ressalvas(p_colaborador_id uuid, p_observacao text DEFAULT NULL::text, p_elegibilidade public.dp_elegibilidade_recontratacao DEFAULT NULL::public.dp_elegibilidade_recontratacao)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_data date;
  v_obs text := NULLIF(btrim(coalesce(p_observacao, '')), '');
  v_id uuid;
BEGIN
  SELECT company_id, data_desligamento INTO v_company, v_data
    FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para registrar ressalvas do desligamento';
  END IF;

  SELECT id INTO v_id
    FROM public.dp_colaborador_desligamento_restrito
   WHERE colaborador_id = p_colaborador_id AND encerrado_em IS NULL
   LIMIT 1;

  IF v_obs IS NULL AND p_elegibilidade IS NULL THEN
    -- Ressalvas limpas no ciclo atual: remove só o registro aberto.
    IF v_id IS NOT NULL THEN
      DELETE FROM public.dp_colaborador_desligamento_restrito WHERE id = v_id;
    END IF;
    RETURN;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_colaborador_desligamento_restrito
      (colaborador_id, company_id, observacao, elegivel_recontratacao, data_desligamento)
    VALUES (p_colaborador_id, v_company, v_obs, p_elegibilidade, v_data);
  ELSE
    UPDATE public.dp_colaborador_desligamento_restrito
       SET observacao = v_obs,
           elegivel_recontratacao = p_elegibilidade,
           company_id = v_company,
           data_desligamento = COALESCE(v_data, data_desligamento)
     WHERE id = v_id;
  END IF;
END;
$function$;

-- Reintegração: encerra o ciclo, preservando o histórico.
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
    UPDATE public.dp_colaborador_desligamento_restrito
       SET encerrado_em = now()
     WHERE colaborador_id = NEW.id AND encerrado_em IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;