
-- Policy: colaborador insere a própria folga
CREATE POLICY dp_folgas_self_insert
ON public.dp_folgas
FOR INSERT
TO authenticated
WITH CHECK (
  colaborador_id = public.dp_colaborador_of(auth.uid())
  AND private.is_company_member(auth.uid(), company_id)
  AND criado_por = auth.uid()
  AND origem = 'solicitacao'
  AND extra = false
  AND tipo = 'normal'
  AND status = 'agendada'
);

-- Policy: colaborador remove a própria folga futura agendada
CREATE POLICY dp_folgas_self_delete
ON public.dp_folgas
FOR DELETE
TO authenticated
USING (
  colaborador_id = public.dp_colaborador_of(auth.uid())
  AND criado_por = auth.uid()
  AND origem = 'solicitacao'
  AND status = 'agendada'
  AND data >= current_date
);

-- Trigger de validação (defesa em profundidade). Ignora admin/owner.
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Admin/owner passa direto
  IF v_uid IS NOT NULL AND private.is_company_admin_or_owner(v_uid, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  -- 1) data não pode ser passada
  IF NEW.data < current_date THEN
    RAISE EXCEPTION 'Não é possível marcar folga em data passada.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2) tipo/extra/origem já são travados pela policy, mas confere weekday
  v_wd := EXTRACT(DOW FROM NEW.data)::int;
  IF v_wd NOT IN (0, 6) THEN
    RAISE EXCEPTION 'Apenas fins de semana podem ser marcados diretamente. Use "Solicitar exceção".'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unidade do colaborador
  SELECT unidade_id INTO v_unidade
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;

  -- 3) folga própria duplicada no mesmo dia
  IF EXISTS (
    SELECT 1 FROM public.dp_folgas
     WHERE colaborador_id = NEW.colaborador_id
       AND data = NEW.data
       AND status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'Você já tem folga marcada neste dia.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 4) limite mensal: 1 folga de fim de semana por mês (extra=false)
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

  -- 5) bloqueio manual (respeita unidade e liberação)
  SELECT motivo, liberada_por_solicitacao
    INTO v_bloq
    FROM public.dp_datas_bloqueadas
   WHERE company_id = NEW.company_id
     AND data = NEW.data
     AND (unidade_id IS NULL OR unidade_id = v_unidade)
   ORDER BY unidade_id NULLS LAST
   LIMIT 1;
  IF FOUND AND COALESCE(v_bloq.liberada_por_solicitacao, false) = false THEN
    RAISE EXCEPTION 'Esta data está bloqueada administrativamente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 6) folga fixa semanal do próprio colaborador
  SELECT folga_fixa_semana INTO v_fixa
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;
  IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
    RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 7) aniversariante ativo naquele dia
  SELECT pa.colaborador_id
    INTO v_aniv
    FROM public.dp_prioridade_aniversario pa
   WHERE pa.company_id = NEW.company_id
     AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
     AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int
     AND pa.status = 'ativa'
     AND pa.data_alvo = NEW.data
   LIMIT 1;
  IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
    RAISE EXCEPTION 'Data reservada para aniversariante.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 8) lotação do dia (precedência: linha da unidade > linha nula)
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
$$;

DROP TRIGGER IF EXISTS trg_dp_folgas_validar_self ON public.dp_folgas;
CREATE TRIGGER trg_dp_folgas_validar_self
BEFORE INSERT ON public.dp_folgas
FOR EACH ROW
EXECUTE FUNCTION public.dp_folgas_validar_self();
