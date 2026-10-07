CREATE TABLE public.dp_whatsapp_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  recibo_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('acesso','senha','recibo')),
  destinatario_nome text,
  telefone text,
  status text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','entregue','lido','falhou')),
  erro text,
  message_id text,
  link text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  entregue_em timestamptz,
  lido_em timestamptz
);
CREATE INDEX dp_whatsapp_envios_company_idx ON public.dp_whatsapp_envios(company_id, created_at DESC);
CREATE INDEX dp_whatsapp_envios_msg_idx ON public.dp_whatsapp_envios(message_id) WHERE message_id IS NOT NULL;
GRANT SELECT ON public.dp_whatsapp_envios TO authenticated;
GRANT ALL ON public.dp_whatsapp_envios TO service_role;
ALTER TABLE public.dp_whatsapp_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestores consultam envios WhatsApp da empresa"
ON public.dp_whatsapp_envios FOR SELECT TO authenticated
USING (public.tem_permissao(company_id, 'dp.colaboradores', 'consulta'));