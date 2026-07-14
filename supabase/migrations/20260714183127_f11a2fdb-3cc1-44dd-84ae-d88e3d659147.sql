
CREATE TABLE public.dp_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  escopo text NOT NULL DEFAULT 'todos' CHECK (escopo IN ('todos','unidade','cargo')),
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE SET NULL,
  publicado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz,
  fixado boolean NOT NULL DEFAULT false,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_avisos TO authenticated;
GRANT ALL ON public.dp_avisos TO service_role;
ALTER TABLE public.dp_avisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_avisos_read" ON public.dp_avisos FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_avisos_write" ON public.dp_avisos FOR ALL TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER dp_avisos_updated_at BEFORE UPDATE ON public.dp_avisos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_avisos_company ON public.dp_avisos(company_id, publicado_em DESC);

CREATE TABLE public.dp_avisos_leituras (
  aviso_id uuid NOT NULL REFERENCES public.dp_avisos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aviso_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.dp_avisos_leituras TO authenticated;
GRANT ALL ON public.dp_avisos_leituras TO service_role;
ALTER TABLE public.dp_avisos_leituras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_leituras_self" ON public.dp_avisos_leituras FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.dp_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  remetente_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destinatario_colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  destinatario_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assunto text NOT NULL,
  corpo text NOT NULL,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_mensagens TO authenticated;
GRANT ALL ON public.dp_mensagens TO service_role;
ALTER TABLE public.dp_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_mensagens_read" ON public.dp_mensagens FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_mensagens_write" ON public.dp_mensagens FOR ALL TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER dp_mensagens_updated_at BEFORE UPDATE ON public.dp_mensagens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_mensagens_company ON public.dp_mensagens(company_id, created_at DESC);
