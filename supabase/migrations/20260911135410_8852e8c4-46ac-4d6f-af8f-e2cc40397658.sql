CREATE TABLE public.dp_colaborador_desligamento_restrito (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id uuid NOT NULL UNIQUE REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  observacao text,
  elegivel_recontratacao public.dp_elegibilidade_recontratacao,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_desligamento_restrito TO authenticated;
GRANT ALL ON public.dp_colaborador_desligamento_restrito TO service_role;

ALTER TABLE public.dp_colaborador_desligamento_restrito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_deslig_restrito_admin_read"
ON public.dp_colaborador_desligamento_restrito
FOR SELECT TO authenticated
USING (
  public.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaborador_desligamento_restrito.company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
);

CREATE POLICY "dp_deslig_restrito_admin_write"
ON public.dp_colaborador_desligamento_restrito
FOR ALL TO authenticated
USING (
  public.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaborador_desligamento_restrito.company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  public.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaborador_desligamento_restrito.company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
);

CREATE TRIGGER dp_deslig_restrito_updated_at
BEFORE UPDATE ON public.dp_colaborador_desligamento_restrito
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.dp_colaborador_desligamento_restrito (colaborador_id, company_id, observacao, elegivel_recontratacao)
SELECT c.id, c.company_id, NULLIF(btrim(coalesce(c.observacao_desligamento, '')), ''), c.elegivel_recontratacao
FROM public.dp_colaboradores c
WHERE c.observacao_desligamento IS NOT NULL OR c.elegivel_recontratacao IS NOT NULL
ON CONFLICT (colaborador_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dp_set_desligamento_ressalvas(p_colaborador_id uuid, p_observacao text DEFAULT NULL::text, p_elegibilidade public.dp_elegibilidade_recontratacao DEFAULT NULL::public.dp_elegibilidade_recontratacao)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_obs text := NULLIF(btrim(coalesce(p_observacao, '')), '');
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para registrar ressalvas do desligamento';
  END IF;

  IF v_obs IS NULL AND p_elegibilidade IS NULL THEN
    DELETE FROM public.dp_colaborador_desligamento_restrito WHERE colaborador_id = p_colaborador_id;
    RETURN;
  END IF;

  INSERT INTO public.dp_colaborador_desligamento_restrito (colaborador_id, company_id, observacao, elegivel_recontratacao)
  VALUES (p_colaborador_id, v_company, v_obs, p_elegibilidade)
  ON CONFLICT (colaborador_id) DO UPDATE
    SET observacao = EXCLUDED.observacao,
        elegivel_recontratacao = EXCLUDED.elegivel_recontratacao,
        company_id = EXCLUDED.company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_desligar_colaborador(p_colaborador_id uuid, p_data_desligamento date, p_motivo dp_motivo_desligamento DEFAULT NULL::dp_motivo_desligamento, p_observacao text DEFAULT NULL::text, p_elegibilidade dp_elegibilidade_recontratacao DEFAULT NULL::dp_elegibilidade_recontratacao)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_folgas int := 0;
  v_sol int := 0;
  v_trocas int := 0;
  v_ate date;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para desligar colaboradores';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = p_data_desligamento,
         motivo_desligamento = p_motivo,
         desligado_por = auth.uid(),
         desligado_em = now(),
         acesso_portal_ate = NULL,
         ativo = false
   WHERE id = p_colaborador_id;

  PERFORM public.dp_set_desligamento_ressalvas(p_colaborador_id, p_observacao, p_elegibilidade);

  SELECT acesso_portal_ate INTO v_ate FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  UPDATE public.dp_folgas
     SET status = 'cancelada'::dp_folga_status
   WHERE colaborador_id = p_colaborador_id
     AND status = 'agendada'::dp_folga_status
     AND data > p_data_desligamento;
  GET DIAGNOSTICS v_folgas = ROW_COUNT;

  UPDATE public.dp_solicitacoes
     SET status = 'cancelada'::dp_solicitacao_status
   WHERE colaborador_id = p_colaborador_id
     AND status = 'pendente'::dp_solicitacao_status;
  GET DIAGNOSTICS v_sol = ROW_COUNT;

  UPDATE public.dp_trocas
     SET status = 'cancelada'::dp_troca_status
   WHERE (solicitante_id = p_colaborador_id OR destino_id = p_colaborador_id)
     AND status IN ('pendente_colega'::dp_troca_status, 'pendente_gestor'::dp_troca_status);
  GET DIAGNOSTICS v_trocas = ROW_COUNT;

  RETURN jsonb_build_object(
    'folgas_canceladas', v_folgas,
    'solicitacoes_canceladas', v_sol,
    'trocas_canceladas', v_trocas,
    'acesso_portal_ate', v_ate
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_editar_desligamento(p_colaborador_id uuid, p_data_desligamento date, p_motivo dp_motivo_desligamento DEFAULT NULL::dp_motivo_desligamento, p_observacao text DEFAULT NULL::text, p_elegibilidade dp_elegibilidade_recontratacao DEFAULT NULL::dp_elegibilidade_recontratacao)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_atual date;
  v_ate date;
BEGIN
  SELECT company_id, data_desligamento INTO v_company, v_atual
    FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para editar o desligamento';
  END IF;
  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'Colaborador não está desligado';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = p_data_desligamento,
         motivo_desligamento = p_motivo,
         acesso_portal_ate = CASE WHEN p_data_desligamento IS DISTINCT FROM v_atual THEN NULL ELSE acesso_portal_ate END
   WHERE id = p_colaborador_id;

  PERFORM public.dp_set_desligamento_ressalvas(p_colaborador_id, p_observacao, p_elegibilidade);

  SELECT acesso_portal_ate INTO v_ate FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  RETURN jsonb_build_object('acesso_portal_ate', v_ate);
END;
$function$;