
CREATE OR REPLACE FUNCTION public.is_dp_colaborador(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'dp_colaborador');
$$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.dp_colaboradores WHERE user_id = _user_id LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.is_dp_colaborador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_dp_colaborador(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.dp_colaborador_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_of(uuid) TO authenticated, service_role;

CREATE POLICY "dp_doc_colab_self_read" ON public.dp_documentos FOR SELECT TO authenticated
USING (colaborador_id IS NOT NULL AND colaborador_id = public.dp_colaborador_of(auth.uid()));

CREATE POLICY "dp_sol_colab_self_read" ON public.dp_solicitacoes FOR SELECT TO authenticated
USING (colaborador_id = public.dp_colaborador_of(auth.uid()));
CREATE POLICY "dp_sol_colab_self_write" ON public.dp_solicitacoes FOR INSERT TO authenticated
WITH CHECK (colaborador_id = public.dp_colaborador_of(auth.uid()));

CREATE POLICY "dp_msg_colab_self_read" ON public.dp_mensagens FOR SELECT TO authenticated
USING (
  destinatario_colaborador_id = public.dp_colaborador_of(auth.uid())
  OR destinatario_user_id = auth.uid()
);

CREATE POLICY "dp_trocas_colab_self_read" ON public.dp_trocas FOR SELECT TO authenticated
USING (
  solicitante_id = public.dp_colaborador_of(auth.uid())
  OR destino_id = public.dp_colaborador_of(auth.uid())
);
