-- =====================================================================
-- FASE 2 — NÚCLEO DO DESLIGAMENTO — RASCUNHO **NÃO APLICADO**
-- Baseline: commit 07d98d280. Banco único (preview = produção) e sem
-- sandbox isolado nem backup confirmado: este arquivo NÃO deve ser
-- aplicado sem autorização explícita e snapshot recuperável.
-- Fica fora de supabase/migrations de propósito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) P0 — o fluxo antigo nunca desativa antes do último dia.
--    Recusa data futura (fuso America/Sao_Paulo) sem efeito colateral;
--    data de hoje ou passada segue o comportamento atual.
--    CREATE OR REPLACE preserva grants/assinatura existentes.
-- ---------------------------------------------------------------------
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
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para desligar colaboradores';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;
  -- P0: data futura não pode desativar o vínculo hoje.
  IF p_data_desligamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Desligamento com data futura ainda não pode ser registrado: o colaborador permanece ativo até o último dia. Registre na data do término.'
      USING ERRCODE = 'P0001', HINT = 'desligamento_futuro_bloqueado';
  END IF;

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

  UPDATE public.dp_folgas SET status = 'cancelada'::dp_folga_status
   WHERE colaborador_id = p_colaborador_id AND status = 'agendada'::dp_folga_status
     AND data > p_data_desligamento;
  GET DIAGNOSTICS v_folgas = ROW_COUNT;

  UPDATE public.dp_solicitacoes SET status = 'cancelada'::dp_solicitacao_status
   WHERE colaborador_id = p_colaborador_id AND status = 'pendente'::dp_solicitacao_status;
  GET DIAGNOSTICS v_sol = ROW_COUNT;

  UPDATE public.dp_trocas SET status = 'cancelada'::dp_troca_status
   WHERE (solicitante_id = p_colaborador_id OR destino_id = p_colaborador_id)
     AND status IN ('pendente_colega'::dp_troca_status, 'pendente_gestor'::dp_troca_status);
  GET DIAGNOSTICS v_trocas = ROW_COUNT;

  RETURN jsonb_build_object('folgas_canceladas', v_folgas, 'solicitacoes_canceladas', v_sol,
                            'trocas_canceladas', v_trocas, 'acesso_portal_ate', v_ate);
END;
$function$;

-- Edição: não aceita mover para o futuro (reativaria um vínculo ainda em
-- curso sem recompor agenda) nem antecipar a data (folgas entre a nova e a
-- antiga data ficariam incoerentes). Só motivo/ressalvas ou a mesma data.
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
    FROM public.dp_colaboradores WHERE id = p_colaborador_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para editar o desligamento';
  END IF;
  IF v_atual IS NULL THEN RAISE EXCEPTION 'Colaborador não está desligado'; END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;
  IF p_data_desligamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A data de desligamento não pode ser futura.' USING HINT = 'desligamento_futuro_bloqueado';
  END IF;
  IF p_data_desligamento < v_atual THEN
    RAISE EXCEPTION 'Antecipar a data exige revisão da agenda; ainda não suportado.' USING HINT = 'antecipacao_bloqueada';
  END IF;

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

-- ---------------------------------------------------------------------
-- B) Núcleo — tabelas aditivas, FAIL-CLOSED: authenticated só lê (RH da
--    empresa); escrita só via service_role até existir recálculo no
--    servidor com o motor TS (Fase 3). Nenhuma RPC de escrita exposta.
-- ---------------------------------------------------------------------
CREATE TABLE public.dp_desligamento_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id),
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aviso_em_curso','suspenso','aguardando_revisao','reconsiderado','cancelado','efetivado')),
  motivo dp_motivo_desligamento NOT NULL,
  modalidade text CHECK (modalidade IN ('trabalhado','indenizado','misto','nao_aplicavel')),
  reducao text CHECK (reducao IN ('duas_horas','sete_dias')),
  -- regra validada? false = não publicável/efetivável (motivos sem regra jurídica)
  regra_validada boolean NOT NULL DEFAULT false,
  regra_versao text,
  data_comunicacao date,
  inicio_aviso date,
  ultimo_comparecimento date,
  dispensado_desde date,
  data_efetiva date,
  projecao_indenizada date,
  base_quitacao date,
  prazo_10_dias date,
  sugestao_pagamento date,
  versao int NOT NULL DEFAULT 1,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (prazo_10_dias IS NULL OR prazo_10_dias = base_quitacao + 10),
  CHECK (sugestao_pagamento IS NULL OR sugestao_pagamento <= prazo_10_dias),
  CHECK (NOT (ultimo_comparecimento IS NOT NULL AND dispensado_desde IS NOT NULL)),
  CHECK (status NOT IN ('aviso_em_curso','efetivado') OR regra_validada)
);
CREATE UNIQUE INDEX dp_desligamento_um_aberto
  ON public.dp_desligamento_processos (colaborador_id)
  WHERE status IN ('rascunho','aviso_em_curso','suspenso','aguardando_revisao');
CREATE INDEX dp_desligamento_processos_company ON public.dp_desligamento_processos (company_id, status);

CREATE TABLE public.dp_desligamento_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processo_id uuid NOT NULL REFERENCES public.dp_desligamento_processos(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  tipo text NOT NULL, -- aberto|datas_alteradas|suspenso|retomado|reconsideracao_*|cancelado|agenda_suspensa|agenda_restaurada|efetivado
  idempotency_key text NOT NULL,
  versao_processo int NOT NULL,
  antes jsonb,   -- só datas/status; nunca salários/documentos
  depois jsonb,
  itens_agenda jsonb, -- [{tabela,id,status_anterior}] para recomposição
  ator uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id, idempotency_key)
);

-- company_id sempre derivado do colaborador, nunca do cliente
CREATE OR REPLACE FUNCTION public.dp_desligamento_company_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'dp_desligamento_processos' THEN
    SELECT company_id INTO NEW.company_id FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
    NEW.updated_at := now();
  ELSE
    SELECT company_id INTO NEW.company_id FROM public.dp_desligamento_processos WHERE id = NEW.processo_id;
  END IF;
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'vínculo inexistente'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dp_desligamento_processos_guard BEFORE INSERT OR UPDATE ON public.dp_desligamento_processos
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_company_guard();
CREATE TRIGGER dp_desligamento_eventos_guard BEFORE INSERT ON public.dp_desligamento_eventos
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_company_guard();

-- append-only
CREATE OR REPLACE FUNCTION public.dp_desligamento_eventos_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'histórico de desligamento é somente inclusão'; END $$;
CREATE TRIGGER dp_desligamento_eventos_append_only BEFORE UPDATE OR DELETE ON public.dp_desligamento_eventos
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_eventos_imutavel();

REVOKE EXECUTE ON FUNCTION public.dp_desligamento_company_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_eventos_imutavel() FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.dp_desligamento_processos TO authenticated;
GRANT SELECT ON public.dp_desligamento_eventos TO authenticated;
GRANT ALL ON public.dp_desligamento_processos TO service_role;
GRANT ALL ON public.dp_desligamento_eventos TO service_role;
ALTER TABLE public.dp_desligamento_processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_desligamento_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RH lê processos da empresa" ON public.dp_desligamento_processos FOR SELECT TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "RH lê eventos da empresa" ON public.dp_desligamento_eventos FOR SELECT TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));

-- ---------------------------------------------------------------------
-- ROLLBACK (não reativa o P0):
--   * manter A) aplicado; se precisar desfazer, restaurar a versão anterior
--     apenas após nova UI segura existir.
--   * B) sem dados reais: DROP TABLE dp_desligamento_eventos, processos
--     e funções dp_desligamento_*; com dados: REVOKE SELECT e congelar.
-- =====================================================================
