CREATE TABLE public.dp_dsr_ciencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  colaborador_id uuid,
  user_id uuid NOT NULL,
  papel text NOT NULL CHECK (papel IN ('solicitante','destino','colaborador','gestor')),
  referencia_tabela text NOT NULL,
  referencia_id uuid,
  data_referencia date,
  dias_seguidos int NOT NULL CHECK (dias_seguidos > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dp_dsr_ciencias TO authenticated;
GRANT ALL ON public.dp_dsr_ciencias TO service_role;
ALTER TABLE public.dp_dsr_ciencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_dsr_ciencias_read ON public.dp_dsr_ciencias FOR SELECT TO authenticated
USING (private.is_company_member((SELECT auth.uid()), company_id) OR user_id = (SELECT auth.uid()));
CREATE INDEX dp_dsr_ciencias_ref_idx ON public.dp_dsr_ciencias (referencia_tabela, referencia_id);

CREATE OR REPLACE FUNCTION public.dp_dsr_ciencia_registrar(
  p_papel text, p_referencia_tabela text, p_referencia_id uuid, p_data date, p_dias int, p_colaborador uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_nome text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_dias IS NULL OR p_dias < 7 THEN RAISE EXCEPTION 'INVALID_INPUT: sequência abaixo do limite.' USING ERRCODE='22023'; END IF;
  IF p_referencia_tabela NOT IN ('dp_trocas','dp_solicitacoes','dp_folgas') THEN
    RAISE EXCEPTION 'INVALID_INPUT: referência inválida.' USING ERRCODE='22023';
  END IF;

  IF p_papel = 'gestor' THEN
    SELECT company_id, nome INTO v_company, v_nome FROM dp_colaboradores WHERE id = p_colaborador;
    IF v_company IS NULL OR NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
    END IF;
    v_colab := p_colaborador;
  ELSIF p_papel IN ('solicitante','destino','colaborador') THEN
    v_colab := public.dp_colaborador_ativo_of(v_uid);
    SELECT company_id, nome INTO v_company, v_nome FROM dp_colaboradores WHERE id = v_colab;
    IF v_company IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_INPUT: papel inválido.' USING ERRCODE='22023';
  END IF;

  INSERT INTO dp_dsr_ciencias (company_id, colaborador_id, user_id, papel, referencia_tabela, referencia_id, data_referencia, dias_seguidos)
  VALUES (v_company, v_colab, v_uid, p_papel, p_referencia_tabela, p_referencia_id, p_data, p_dias)
  RETURNING id INTO v_id;

  IF p_papel <> 'gestor' THEN
    INSERT INTO dp_notificacoes (company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    VALUES (v_company, v_colab,
      CASE WHEN p_referencia_tabela = 'dp_trocas' THEN 'troca_resposta_colega'::dp_notificacao_tipo ELSE 'folga_remarcada'::dp_notificacao_tipo END,
      'Alerta de DSR: mais de 6 dias seguidos',
      format('%s ficará %s dias seguidos trabalhando sem descanso a partir desta mudança de folga (%s). O colaborador deu ciência da regra.',
             coalesce(v_nome,'Colaborador'), p_dias, to_char(p_data,'DD/MM/YYYY')),
      p_referencia_tabela, p_referencia_id, true,
      'dsr:' || v_id::text);
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_dsr_ciencia_registrar(text,text,uuid,date,int,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_dsr_ciencia_registrar(text,text,uuid,date,int,uuid) TO authenticated, service_role;