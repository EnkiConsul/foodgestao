-- 12x36: folga compensatória de feriado não se aplica (Art. 59-A, parágrafo único, CLT).
-- Gatilho único em dp_folgas cobre todas as rotas (gestor, pedido do portal aprovado, rotinas internas).
CREATE OR REPLACE FUNCTION private.dp_folga_compensacao_12x36_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.direito_origem IS DISTINCT FROM 'compensacao_feriado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.direito_origem IS NOT DISTINCT FROM NEW.direito_origem THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status::text, '') = 'cancelada' THEN RETURN NEW; END IF;
  IF private.dp_12x36_plantao_em(NEW.colaborador_id, NEW.data) IS NOT NULL THEN
    RAISE EXCEPTION 'COMPENSACAO_INELEGIVEL: na escala 12x36 domingos e feriados já são compensados pelo descanso de 36 horas (Art. 59-A, parágrafo único, da CLT).'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.dp_folga_compensacao_12x36_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_compensacao_12x36_guard() TO service_role;

DROP TRIGGER IF EXISTS dp_folgas_compensacao_12x36_guard ON public.dp_folgas;
CREATE TRIGGER dp_folgas_compensacao_12x36_guard
  BEFORE INSERT OR UPDATE OF direito_origem ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION private.dp_folga_compensacao_12x36_guard();

-- Portal: quem está em 12x36 não vê o pedido de compensação de feriado.
CREATE OR REPLACE FUNCTION public.dp_portal_minha_regra_compensacao()
 RETURNS TABLE(compensa_feriados boolean, antecedencia_dias integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN private.dp_12x36_plantao_em(c.id, CURRENT_DATE) IS NOT NULL THEN false
              ELSE COALESCE(cc.usa_compensa_feriados, u.compensa_feriados, false) END,
         COALESCE(u.compensacao_feriado_antecedencia_dias, 2)
  FROM public.dp_colaboradores c
  LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
  LEFT JOIN public.dp_colaborador_compensacao cc ON cc.colaborador_id = c.id
  WHERE c.user_id = auth.uid() AND c.ativo AND c.deleted_at IS NULL
  LIMIT 1
$function$;

-- Equipe do portal: acrescenta o início do ciclo 12x36 vigente (só a data, nenhum outro dado do cadastro).
DROP FUNCTION IF EXISTS public.dp_portal_equipe_unidade();

CREATE FUNCTION public.dp_portal_equipe_unidade()
 RETURNS TABLE(id uuid, nome text, nome_social text, cargo text, folga_fixa_semana integer, ativo boolean, unidade_id uuid, folgas_fixas_dow smallint[], plantao_12x36 date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid; v_cat text;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores c WHERE c.id = v_colab;
  IF v_company IS NULL THEN RETURN; END IF;

  SELECT t.categoria::text INTO v_cat
  FROM public.dp_colaborador_config_trabalho ct
  JOIN public.dp_turnos t ON t.id = ct.turno_padrao_id
  WHERE ct.colaborador_id = v_colab
    AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= CURRENT_DATE)
    AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= CURRENT_DATE)
  ORDER BY ct.vigencia_inicio DESC NULLS LAST
  LIMIT 1;

  RETURN QUERY
  SELECT c.id, c.nome, c.nome_social, c.cargo, c.folga_fixa_semana::integer, c.ativo, c.unidade_id,
         public.dp_dias_fixos_folga(c.id, CURRENT_DATE),
         (SELECT CASE WHEN ct3.escala_modelo = '12x36' THEN ct3.data_primeiro_plantao END
            FROM public.dp_colaborador_config_trabalho ct3
           WHERE ct3.colaborador_id = c.id
             AND ct3.vigencia_inicio <= CURRENT_DATE
             AND (ct3.vigencia_fim IS NULL OR ct3.vigencia_fim >= CURRENT_DATE)
           ORDER BY ct3.vigencia_inicio DESC, ct3.id
           LIMIT 1)
  FROM public.dp_colaboradores c
  WHERE c.company_id = v_company AND c.ativo IS NOT FALSE
    AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
    AND (
      c.id = v_colab
      OR (
        lower(coalesce(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
        AND (
          v_cat IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.dp_colaborador_config_trabalho ct2
            JOIN public.dp_turnos t2 ON t2.id = ct2.turno_padrao_id
            WHERE ct2.colaborador_id = c.id
              AND (ct2.vigencia_inicio IS NULL OR ct2.vigencia_inicio <= CURRENT_DATE)
              AND (ct2.vigencia_fim IS NULL OR ct2.vigencia_fim >= CURRENT_DATE)
              AND t2.categoria::text = v_cat
          )
        )
      )
    )
  ORDER BY c.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_equipe_unidade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_equipe_unidade() TO authenticated, service_role;