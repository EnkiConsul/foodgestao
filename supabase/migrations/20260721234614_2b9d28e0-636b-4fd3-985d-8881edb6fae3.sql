CREATE OR REPLACE FUNCTION public.dp_folgas_validar_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wd int;
  v_unidade uuid;
  v_limite int;
  v_ocupados int;
  v_mensais int;
  v_bloq record;
  v_fixa int;
  v_aniv record;
BEGIN
  IF v_uid IS NOT NULL AND private.is_company_admin_or_owner(v_uid, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.data < current_date THEN
    RAISE EXCEPTION 'Não é possível marcar folga em data passada.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_wd := EXTRACT(DOW FROM NEW.data)::int;
  IF v_wd NOT IN (0, 6) THEN
    RAISE EXCEPTION 'Apenas fins de semana podem ser marcados diretamente. Use "Solicitar exceção".'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT unidade_id INTO v_unidade
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas
     WHERE colaborador_id = NEW.colaborador_id
       AND data = NEW.data
       AND status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'Você já tem folga marcada neste dia.'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT count(*) INTO v_mensais
    FROM public.dp_folgas
   WHERE colaborador_id = NEW.colaborador_id
     AND extra = false
     AND status <> 'cancelada'
     AND EXTRACT(DOW FROM data) IN (0, 6)
     AND date_trunc('month', data) = date_trunc('month', NEW.data);
  IF v_mensais >= 1 THEN
    RAISE EXCEPTION 'Você já possui uma folga de fim de semana neste mês.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT motivo, liberada_por_solicitacao
    INTO v_bloq
    FROM public.dp_datas_bloqueadas
   WHERE company_id = NEW.company_id
     AND data = NEW.data
     AND (unidade_id IS NULL OR unidade_id = v_unidade)
   ORDER BY unidade_id NULLS LAST
   LIMIT 1;
  IF FOUND AND v_bloq.liberada_por_solicitacao IS NULL THEN
    RAISE EXCEPTION 'Esta data está bloqueada administrativamente.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT folga_fixa_semana INTO v_fixa
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;
  IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
    RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pa.colaborador_id
    INTO v_aniv
    FROM public.dp_prioridade_aniversario pa
    JOIN public.dp_colaboradores c ON c.id = pa.colaborador_id
   WHERE pa.company_id = NEW.company_id
     AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
     AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int
     AND pa.aniversariante = true
     AND c.data_nascimento IS NOT NULL
     AND EXTRACT(DAY FROM c.data_nascimento) = EXTRACT(DAY FROM NEW.data)
   LIMIT 1;
  IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
    RAISE EXCEPTION 'Data reservada para aniversariante.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT limite_folgas INTO v_limite
    FROM public.dp_dia_config
   WHERE company_id = NEW.company_id
     AND data = NEW.data
     AND (unidade_id IS NULL OR unidade_id = v_unidade)
   ORDER BY unidade_id NULLS LAST
   LIMIT 1;
  v_limite := COALESCE(v_limite, 1);

  SELECT count(*) INTO v_ocupados
    FROM public.dp_folgas f
    JOIN public.dp_colaboradores c ON c.id = f.colaborador_id
   WHERE f.company_id = NEW.company_id
     AND f.data = NEW.data
     AND f.status <> 'cancelada'
     AND f.extra = false
     AND (v_unidade IS NULL OR c.unidade_id = v_unidade);
  IF v_ocupados >= v_limite THEN
    RAISE EXCEPTION 'Data indisponível. Limite de folgas atingido.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;