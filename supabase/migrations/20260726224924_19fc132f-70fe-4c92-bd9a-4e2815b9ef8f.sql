ALTER TABLE public.dp_avisos
  ADD COLUMN IF NOT EXISTS leitura_obrigatoria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permitir_reacoes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permitir_comentarios boolean NOT NULL DEFAULT false;

-- Admins podem ver as confirmações de leitura
CREATE POLICY "dp_leituras_admin_read" ON public.dp_avisos_leituras FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dp_avisos a
  WHERE a.id = dp_avisos_leituras.aviso_id
    AND private.is_company_admin_or_owner(auth.uid(), a.company_id)
));

CREATE TABLE public.dp_avisos_reacoes (
  aviso_id uuid NOT NULL REFERENCES public.dp_avisos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aviso_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_avisos_reacoes TO authenticated;
GRANT ALL ON public.dp_avisos_reacoes TO service_role;
ALTER TABLE public.dp_avisos_reacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_reacoes_read" ON public.dp_avisos_reacoes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dp_avisos a
  WHERE a.id = dp_avisos_reacoes.aviso_id
    AND private.is_company_member(auth.uid(), a.company_id)
));
CREATE POLICY "dp_reacoes_self_write" ON public.dp_avisos_reacoes FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.dp_avisos a
  WHERE a.id = dp_avisos_reacoes.aviso_id
    AND a.permitir_reacoes
    AND private.is_company_member(auth.uid(), a.company_id)
));

CREATE TABLE public.dp_avisos_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aviso_id uuid NOT NULL REFERENCES public.dp_avisos(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  autor_nome text,
  conteudo text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','oculto')),
  moderado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moderado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_avisos_comentarios TO authenticated;
GRANT ALL ON public.dp_avisos_comentarios TO service_role;
ALTER TABLE public.dp_avisos_comentarios ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dp_avisos_comentarios_aviso ON public.dp_avisos_comentarios(aviso_id, created_at DESC);

CREATE POLICY "dp_comentarios_read" ON public.dp_avisos_comentarios FOR SELECT TO authenticated
USING (
  private.is_company_member(auth.uid(), company_id)
  AND (
    status = 'aprovado'
    OR user_id = auth.uid()
    OR private.is_company_admin_or_owner(auth.uid(), company_id)
  )
);
CREATE POLICY "dp_comentarios_self_insert" ON public.dp_avisos_comentarios FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.is_company_member(auth.uid(), company_id)
  AND EXISTS (
    SELECT 1 FROM public.dp_avisos a
    WHERE a.id = aviso_id AND a.company_id = dp_avisos_comentarios.company_id AND a.permitir_comentarios
  )
);
CREATE POLICY "dp_comentarios_self_delete" ON public.dp_avisos_comentarios FOR DELETE TO authenticated
USING (user_id = auth.uid() OR private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "dp_comentarios_admin_update" ON public.dp_avisos_comentarios FOR UPDATE TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_avisos_comentarios_updated_at BEFORE UPDATE ON public.dp_avisos_comentarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();