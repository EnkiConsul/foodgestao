-- 1) Expande regras de escopo empresa em uma regra por unidade
DO $$
DECLARE
  r record;
  u record;
  v_new uuid;
BEGIN
  FOR r IN SELECT * FROM public.dp_folga_limite_regras WHERE unidade_id IS NULL LOOP
    FOR u IN SELECT id FROM public.dp_unidades WHERE company_id = r.company_id LOOP
      INSERT INTO public.dp_folga_limite_regras
        (company_id, unidade_id, tipo, nome, dia_semana, maximo,
         vigencia_inicio, vigencia_fim, ativo, observacao)
      VALUES
        (r.company_id, u.id, r.tipo, r.nome, r.dia_semana, r.maximo,
         r.vigencia_inicio, r.vigencia_fim, r.ativo, r.observacao)
      RETURNING id INTO v_new;

      INSERT INTO public.dp_folga_limite_regra_cargos (regra_id, cargo_id)
      SELECT v_new, rc.cargo_id
        FROM public.dp_folga_limite_regra_cargos rc
       WHERE rc.regra_id = r.id;

      INSERT INTO public.dp_folga_limite_regra_colaboradores (regra_id, colaborador_id)
      SELECT v_new, rm.colaborador_id
        FROM public.dp_folga_limite_regra_colaboradores rm
       WHERE rm.regra_id = r.id;
    END LOOP;
  END LOOP;
END $$;

DELETE FROM public.dp_folga_limite_regras WHERE unidade_id IS NULL;

ALTER TABLE public.dp_folga_limite_regras ALTER COLUMN unidade_id SET NOT NULL;

-- 2) Limite do dia: só regras da unidade informada
CREATE OR REPLACE FUNCTION public.dp_folga_limite_dia(p_company uuid, p_unidade uuid, p_cargo uuid, p_data date, p_ignorar_colaborador uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wd int;
  v_limite int;
  v_origem text := 'sem_limite';
  v_regra_id uuid;
  v_por_cargo boolean := false;
  v_em_folga int := 0;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e data são obrigatórias.' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                      WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  v_wd := EXTRACT(DOW FROM p_data)::int;

  SELECT dc.limite_folgas INTO v_limite
    FROM public.dp_dia_config dc
   WHERE dc.company_id = p_company
     AND dc.data = p_data
     AND (dc.unidade_id IS NULL OR dc.unidade_id = p_unidade)
   ORDER BY (dc.unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL THEN
    v_origem := 'excecao_data';
  ELSE
    SELECT r.maximo, r.id,
           EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
      INTO v_limite, v_regra_id, v_por_cargo
      FROM public.dp_folga_limite_regras r
     WHERE r.company_id = p_company
       AND r.ativo = true
       AND r.tipo IN ('quantidade', 'cargo')
       AND r.unidade_id = p_unidade
       AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
       AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= p_data)
       AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= p_data)
       AND (
         NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
         OR (p_cargo IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.dp_folga_limite_regra_cargos rc
               WHERE rc.regra_id = r.id AND rc.cargo_id = p_cargo))
       )
     ORDER BY (EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)) DESC,
              (r.dia_semana IS NOT NULL) DESC,
              r.vigencia_inicio DESC NULLS LAST
     LIMIT 1;

    IF v_limite IS NOT NULL THEN
      v_origem := 'regra_recorrente';
    END IF;
  END IF;

  SELECT count(*) INTO v_em_folga
    FROM public.dp_colaboradores c
   WHERE c.company_id = p_company
     AND c.deleted_at IS NULL
     AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
     AND (NOT v_por_cargo OR p_cargo IS NULL OR c.cargo_id = p_cargo)
     AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
     AND (
       EXISTS (SELECT 1 FROM public.dp_folgas f
                WHERE f.colaborador_id = c.id AND f.data = p_data
                  AND f.status <> 'cancelada' AND f.extra = false
                  AND f.tipo NOT IN ('ferias', 'licenca'))
       OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                   WHERE s.colaborador_id = c.id AND s.tipo = 'folga'
                     AND s.data_alvo = p_data AND s.status = 'aprovada')
     );

  RETURN jsonb_build_object(
    'limite', v_limite,
    'origem', v_origem,
    'regra_id', v_regra_id,
    'por_cargo', v_por_cargo,
    'em_folga', COALESCE(v_em_folga, 0),
    'disponivel', CASE WHEN v_limite IS NULL THEN NULL
                       ELSE GREATEST(v_limite - COALESCE(v_em_folga, 0), 0) END,
    'excedido', CASE WHEN v_limite IS NULL THEN false
                     ELSE COALESCE(v_em_folga, 0) >= v_limite END);
END;
$function$;

-- 3) Conflito entre pessoas: só regras da unidade do colaborador
CREATE OR REPLACE FUNCTION public.dp_folga_conflito_colaboradores(_company uuid, _colaborador uuid, _data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wd int;
  v_unidade uuid;
  v_row record;
BEGIN
  IF _company IS NULL OR _colaborador IS NULL OR _data IS NULL THEN
    RETURN jsonb_build_object('conflito', false);
  END IF;

  v_wd := EXTRACT(DOW FROM _data)::int;
  SELECT unidade_id INTO v_unidade FROM public.dp_colaboradores WHERE id = _colaborador;

  SELECT r.id AS regra_id, r.nome, c2.id AS colega_id, c2.nome AS colega_nome
    INTO v_row
    FROM public.dp_folga_limite_regras r
    JOIN public.dp_folga_limite_regra_colaboradores m1
      ON m1.regra_id = r.id AND m1.colaborador_id = _colaborador
    JOIN public.dp_folga_limite_regra_colaboradores m2
      ON m2.regra_id = r.id AND m2.colaborador_id <> _colaborador
    JOIN public.dp_colaboradores c2 ON c2.id = m2.colaborador_id
   WHERE r.company_id = _company
     AND r.ativo = true
     AND r.tipo = 'colaboradores'
     AND r.unidade_id = v_unidade
     AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
     AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= _data)
     AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= _data)
     AND (
       EXISTS (SELECT 1 FROM public.dp_folgas f
                WHERE f.colaborador_id = c2.id AND f.data = _data
                  AND f.status <> 'cancelada' AND f.extra = false
                  AND f.tipo NOT IN ('ferias', 'licenca'))
       OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                   WHERE s.colaborador_id = c2.id AND s.tipo = 'folga'
                     AND s.data_alvo = _data AND s.status IN ('pendente', 'aprovada'))
     )
   LIMIT 1;

  IF v_row.colega_id IS NULL THEN
    RETURN jsonb_build_object('conflito', false);
  END IF;

  RETURN jsonb_build_object(
    'conflito', true,
    'regra_id', v_row.regra_id,
    'regra_nome', v_row.nome,
    'colega_id', v_row.colega_id,
    'colega_nome', v_row.colega_nome);
END;
$function$;