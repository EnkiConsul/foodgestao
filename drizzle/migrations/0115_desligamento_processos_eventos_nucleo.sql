-- Fase 2: núcleo aditivo do processo de desligamento. FAIL-CLOSED:
-- authenticated só lê (dono/admin da empresa); escrita só service_role,
-- até existir recálculo no servidor com o motor TS (Fase 3).
CREATE TABLE IF NOT EXISTS public.dp_desligamento_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id),
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aviso_em_curso','suspenso','aguardando_revisao','reconsiderado','cancelado','efetivado')),
  motivo public.dp_motivo_desligamento NOT NULL,
  modalidade text CHECK (modalidade IN ('trabalhado','indenizado','misto','nao_aplicavel')),
  reducao text CHECK (reducao IN ('duas_horas','sete_dias')),
  regra_validada boolean NOT NULL DEFAULT false,
  regra_versao text,
  calculado_por text CHECK (calculado_por IN ('motor_servidor')),
  data_comunicacao date,
  inicio_aviso date,
  ultimo_comparecimento date,
  dispensado_desde date,
  data_efetiva date,
  projecao_indenizada date,
  base_quitacao date,
  prazo_10_dias date,
  sugestao_pagamento date,
  versao integer NOT NULL DEFAULT 1,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_desl_prazo_10 CHECK (prazo_10_dias IS NULL OR prazo_10_dias = base_quitacao + 10),
  CONSTRAINT dp_desl_sugestao CHECK (sugestao_pagamento IS NULL OR sugestao_pagamento <= prazo_10_dias),
  CONSTRAINT dp_desl_comparecimento_xor CHECK (ultimo_comparecimento IS NULL OR dispensado_desde IS NULL),
  CONSTRAINT dp_desl_inicio CHECK (inicio_aviso IS NULL OR inicio_aviso = data_comunicacao + 1),
  CONSTRAINT dp_desl_publicavel CHECK (status NOT IN ('aviso_em_curso','efetivado')
    OR (regra_validada AND calculado_por = 'motor_servidor' AND prazo_10_dias IS NOT NULL AND data_efetiva IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS dp_desligamento_um_aberto
  ON public.dp_desligamento_processos (colaborador_id)
  WHERE status IN ('rascunho','aviso_em_curso','suspenso','aguardando_revisao');
CREATE INDEX IF NOT EXISTS dp_desligamento_processos_company
  ON public.dp_desligamento_processos (company_id, status);

CREATE TABLE IF NOT EXISTS public.dp_desligamento_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processo_id uuid NOT NULL REFERENCES public.dp_desligamento_processos(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  tipo text NOT NULL CHECK (tipo IN ('aberto','datas_alteradas','suspenso','retomado',
    'reconsideracao_solicitada','reconsideracao_aceita','reconsideracao_recusada',
    'cancelado','agenda_suspensa','agenda_restaurada','efetivado')),
  idempotency_key text NOT NULL,
  versao_processo integer NOT NULL,
  antes jsonb,
  depois jsonb,
  itens_agenda jsonb,
  ator uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_desl_evento_idem UNIQUE (processo_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS dp_desligamento_eventos_processo
  ON public.dp_desligamento_eventos (processo_id, created_at);
COMMENT ON COLUMN public.dp_desligamento_eventos.itens_agenda IS
  'Lista [{tabela,id,status_anterior}] para recompor a agenda; sem valores salariais nem notas internas.';

-- Empresa sempre derivada do vínculo; vínculo e empresa imutáveis depois.
CREATE OR REPLACE FUNCTION public.dp_desligamento_processo_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador inexistente'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.colaborador_id <> OLD.colaborador_id OR NEW.company_id <> OLD.company_id) THEN
    RAISE EXCEPTION 'Vínculo e empresa do processo não podem mudar';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('efetivado','cancelado','reconsiderado') THEN
    RAISE EXCEPTION 'Processo encerrado não pode ser alterado';
  END IF;
  NEW.company_id := v_company;
  IF TG_OP = 'UPDATE' THEN
    NEW.versao := OLD.versao + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dp_desligamento_evento_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Histórico de desligamento é somente inclusão';
  END IF;
  SELECT company_id INTO NEW.company_id FROM public.dp_desligamento_processos WHERE id = NEW.processo_id;
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'Processo inexistente'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dp_desligamento_processos_guard ON public.dp_desligamento_processos;
CREATE TRIGGER dp_desligamento_processos_guard BEFORE INSERT OR UPDATE ON public.dp_desligamento_processos
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_processo_guard();
DROP TRIGGER IF EXISTS dp_desligamento_eventos_guard ON public.dp_desligamento_eventos;
CREATE TRIGGER dp_desligamento_eventos_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dp_desligamento_eventos
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_evento_guard();

REVOKE EXECUTE ON FUNCTION public.dp_desligamento_processo_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_evento_guard() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.dp_desligamento_processos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.dp_desligamento_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dp_desligamento_processos TO authenticated;
GRANT SELECT ON public.dp_desligamento_eventos TO authenticated;
GRANT ALL ON public.dp_desligamento_processos TO service_role;
GRANT ALL ON public.dp_desligamento_eventos TO service_role;

ALTER TABLE public.dp_desligamento_processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_desligamento_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dp_desl_proc_rh_select ON public.dp_desligamento_processos;
CREATE POLICY dp_desl_proc_rh_select ON public.dp_desligamento_processos FOR SELECT TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));
DROP POLICY IF EXISTS dp_desl_evt_rh_select ON public.dp_desligamento_eventos;
CREATE POLICY dp_desl_evt_rh_select ON public.dp_desligamento_eventos FOR SELECT TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));