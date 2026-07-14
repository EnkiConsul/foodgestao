
-- Enum de tipos de notificação
DO $$ BEGIN
  CREATE TYPE public.dp_notificacao_tipo AS ENUM (
    'solicitacao_nova','solicitacao_respondida',
    'troca_nova','troca_resposta_colega','troca_resposta_gestor',
    'disciplinar_novo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE public.dp_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo public.dp_notificacao_tipo NOT NULL,
  titulo text NOT NULL,
  descricao text,
  ref_table text NOT NULL,
  ref_id uuid NOT NULL,
  para_admins boolean NOT NULL DEFAULT false,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_notificacoes TO authenticated;
GRANT ALL ON public.dp_notificacoes TO service_role;

ALTER TABLE public.dp_notificacoes ENABLE ROW LEVEL SECURITY;

-- Admins da empresa veem tudo
CREATE POLICY "Admins read dp_notificacoes"
  ON public.dp_notificacoes FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Admins update dp_notificacoes"
  ON public.dp_notificacoes FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

-- Destinatário vê a própria
CREATE POLICY "User reads own dp_notificacoes"
  ON public.dp_notificacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "User updates own dp_notificacoes"
  ON public.dp_notificacoes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_dp_notif_company ON public.dp_notificacoes(company_id, lida_em);
CREATE INDEX idx_dp_notif_user ON public.dp_notificacoes(user_id, lida_em);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dp_notificacoes;

-- ==================== TRIGGERS ====================

-- Solicitações: nova (pendente) → notifica admins
CREATE OR REPLACE FUNCTION public.dp_notif_solicitacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT nome INTO v_nome FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'solicitacao_nova',
            'Nova solicitação: ' || COALESCE(v_nome,'colaborador'),
            'Tipo: ' || NEW.tipo::text,
            'dp_solicitacoes', NEW.id, true);
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('aprovada','recusada') THEN
    SELECT c.user_id INTO v_nome FROM public.dp_colaboradores c WHERE c.id = NEW.colaborador_id;
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
    SELECT NEW.company_id, c.user_id, c.id, 'solicitacao_respondida',
           'Sua solicitação foi ' || NEW.status::text,
           'Tipo: ' || NEW.tipo::text,
           'dp_solicitacoes', NEW.id
    FROM public.dp_colaboradores c
    WHERE c.id = NEW.colaborador_id AND c.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dp_notif_solicitacao ON public.dp_solicitacoes;
CREATE TRIGGER trg_dp_notif_solicitacao
  AFTER INSERT OR UPDATE ON public.dp_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_notif_solicitacao();

-- Trocas: nova → notifica admins; resposta colega/gestor → notifica solicitante
CREATE OR REPLACE FUNCTION public.dp_notif_troca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_solic uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'troca_nova', 'Nova solicitação de troca',
            'Data original: ' || NEW.data_original::text,
            'dp_trocas', NEW.id, true);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.colega_resposta IS DISTINCT FROM OLD.colega_resposta AND NEW.colega_resposta IS NOT NULL THEN
      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_colega',
                'Colega respondeu à sua troca', 'dp_trocas', NEW.id);
      END IF;
    END IF;
    IF NEW.gestor_resposta IS DISTINCT FROM OLD.gestor_resposta AND NEW.gestor_resposta IS NOT NULL THEN
      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_gestor',
                'Gestor respondeu à sua troca', 'dp_trocas', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dp_notif_troca ON public.dp_trocas;
CREATE TRIGGER trg_dp_notif_troca
  AFTER INSERT OR UPDATE ON public.dp_trocas
  FOR EACH ROW EXECUTE FUNCTION public.dp_notif_troca();

-- Disciplinar: novo → notifica admins + colaborador (se tiver user_id)
CREATE OR REPLACE FUNCTION public.dp_notif_disciplinar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (NEW.company_id, 'disciplinar_novo', 'Novo registro disciplinar',
          'Tipo: ' || NEW.tipo::text, 'dp_registros_disciplinares', NEW.id, true);

  SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_user IS NOT NULL THEN
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
    VALUES (NEW.company_id, v_user, NEW.colaborador_id, 'disciplinar_novo',
            'Novo registro no seu histórico', 'Tipo: ' || NEW.tipo::text,
            'dp_registros_disciplinares', NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dp_notif_disciplinar ON public.dp_registros_disciplinares;
CREATE TRIGGER trg_dp_notif_disciplinar
  AFTER INSERT ON public.dp_registros_disciplinares
  FOR EACH ROW EXECUTE FUNCTION public.dp_notif_disciplinar();
