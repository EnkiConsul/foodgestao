-- =========================================================
-- Convocações — Fase 3A.1.1 (hardening pós-implementação)
-- Incremental. Não altera nenhuma migration da 3A.1.
-- =========================================================

-- 1) dp_timezone_resolvido: SECURITY DEFINER -> SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.dp_timezone_resolvido(_company_id uuid, _unidade_id uuid DEFAULT NULL::uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT u.timezone FROM public.dp_unidades u
      WHERE u.id = _unidade_id AND u.company_id = _company_id AND u.timezone IS NOT NULL),
    (SELECT c.timezone FROM public.companies c
      WHERE c.id = _company_id AND c.timezone IS NOT NULL)
  );
$function$;

-- Menor privilégio: nenhum consumidor legítimo no frontend/Edge Functions/banco.
REVOKE EXECUTE ON FUNCTION public.dp_timezone_resolvido(uuid, uuid) FROM anon, authenticated;

-- 2) FKs de substituição -> compostas com company_id.
--    PG 17: ON DELETE SET NULL (<coluna>) preserva company_id (NOT NULL).
ALTER TABLE public.dp_convocacoes
  DROP CONSTRAINT fk_dp_convocacoes_substituida_por,
  DROP CONSTRAINT fk_dp_convocacoes_substitui;

ALTER TABLE public.dp_convocacoes
  ADD CONSTRAINT fk_dp_convocacoes_substituida_por
    FOREIGN KEY (substituida_por_id, company_id)
    REFERENCES public.dp_convocacoes (id, company_id)
    ON DELETE SET NULL (substituida_por_id),
  ADD CONSTRAINT fk_dp_convocacoes_substitui
    FOREIGN KEY (substitui_convocacao_id, company_id)
    REFERENCES public.dp_convocacoes (id, company_id)
    ON DELETE SET NULL (substitui_convocacao_id);

-- 3) Descumprimentos: referência CLT restrita a exatamente 50 pontos percentuais,
--    somente intermitente + sem_justo_motivo, bilateral (colaborador ou empregador).
ALTER TABLE public.dp_convocacao_descumprimentos
  DROP CONSTRAINT dp_conv_descump_percentual_faixa_check,
  DROP CONSTRAINT dp_conv_descump_percentual_regime_check,
  DROP CONSTRAINT dp_conv_descump_percentual_analise_check;

ALTER TABLE public.dp_convocacao_descumprimentos
  ADD CONSTRAINT dp_conv_descump_percentual_referencia_check CHECK (
    percentual_referencia IS NULL
    OR (
      percentual_referencia = 50
      AND regime_snapshot = 'intermitente'::public.dp_regime_trabalho
      AND analise = 'sem_justo_motivo'
      AND parte_responsavel IN ('colaborador', 'empregador')
    )
  );

-- 4) Grants efetivos: RPC-only. anon sem nada; authenticated só SELECT (limitado por RLS).
REVOKE ALL ON TABLE
  public.dp_convocacao_grupos,
  public.dp_convocacao_ocorrencias,
  public.dp_convocacao_config,
  public.dp_indisponibilidades,
  public.dp_convocacao_descumprimentos,
  public.dp_convocacao_eventos
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.dp_convocacao_grupos,
  public.dp_convocacao_ocorrencias,
  public.dp_convocacao_config,
  public.dp_indisponibilidades,
  public.dp_convocacao_descumprimentos,
  public.dp_convocacao_eventos
TO authenticated;

-- dp_convocacao_eventos é append-only: service_role sem UPDATE/DELETE/TRUNCATE.
REVOKE ALL ON TABLE public.dp_convocacao_eventos FROM service_role;
GRANT SELECT, INSERT ON TABLE public.dp_convocacao_eventos TO service_role;