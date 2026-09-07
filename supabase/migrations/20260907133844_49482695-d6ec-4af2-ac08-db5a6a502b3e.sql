ALTER TABLE public.dp_pendencias_config ADD COLUMN IF NOT EXISTS alerta_ocorrencia_horas smallint NOT NULL DEFAULT 24;
UPDATE public.dp_pendencias_config SET alerta_ocorrencia_horas = 24 WHERE alerta_ocorrencia_horas IS NULL;

ALTER TABLE public.dp_ocorrencia_coberturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins insert ocorrencia coberturas" ON public.dp_ocorrencia_coberturas;
CREATE POLICY "Admins insert ocorrencia coberturas"
ON public.dp_ocorrencia_coberturas
FOR INSERT
TO authenticated
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins update ocorrencia coberturas" ON public.dp_ocorrencia_coberturas;
CREATE POLICY "Admins update ocorrencia coberturas"
ON public.dp_ocorrencia_coberturas
FOR UPDATE
TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins delete ocorrencia coberturas" ON public.dp_ocorrencia_coberturas;
CREATE POLICY "Admins delete ocorrencia coberturas"
ON public.dp_ocorrencia_coberturas
FOR DELETE
TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ocorrencia_coberturas TO authenticated;
GRANT ALL ON public.dp_ocorrencia_coberturas TO service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_cobertura_criar(
  _ocorrencia_id uuid,
  _substituto_colaborador_id uuid DEFAULT NULL,
  _mao_de_obra_extra_id uuid DEFAULT NULL,
  _entrada time without time zone DEFAULT NULL,
  _saida time without time zone DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o record;
  v_id uuid;
  v_tem_outra uuid;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;
  IF o.tipo NOT IN ('falta','previsao_falta','saida_antecipada','previsao_saida_antecipada') THEN
    RAISE EXCEPTION 'OCORRENCIA_COBERTURA_TIPO_INVALIDO';
  END IF;
  IF _substituto_colaborador_id IS NULL AND _mao_de_obra_extra_id IS NULL THEN
    RAISE EXCEPTION 'OCORRENCIA_COBERTURA_SEM_SUBSTITUTO';
  END IF;
  IF _substituto_colaborador_id IS NOT NULL AND _mao_de_obra_extra_id IS NOT NULL THEN
    RAISE EXCEPTION 'OCORRENCIA_COBERTURA_DOIS_SUBSTITUTOS';
  END IF;

  SELECT id INTO v_tem_outra FROM public.dp_ocorrencia_coberturas
   WHERE ocorrencia_id = _ocorrencia_id AND status <> 'recusada' LIMIT 1;
  IF v_tem_outra IS NOT NULL THEN
    RAISE EXCEPTION 'OCORRENCIA_COBERTURA_EXISTENTE:%', v_tem_outra;
  END IF;

  INSERT INTO public.dp_ocorrencia_coberturas (
    company_id, ocorrencia_id, substituto_colaborador_id, mao_de_obra_extra_id,
    entrada, saida, status, execucao_status, proposto_por
  ) VALUES (
    o.company_id, _ocorrencia_id, _substituto_colaborador_id, _mao_de_obra_extra_id,
    _entrada, _saida, 'proposta', 'prevista', auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_novo, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'cobertura_criada', 'status', 'proposta', auth.uid());

  PERFORM public.dp_notificar_criador_ocorrencia(_ocorrencia_id, 'Cobertura proposta', 'Uma cobertura foi sugerida para a ocorrência.');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_cobertura_decidir(
  _cobertura_id uuid,
  _aprovar boolean,
  _motivo_recusa text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c record;
  o record;
  v_status text;
BEGIN
  SELECT * INTO c FROM public.dp_ocorrencia_coberturas WHERE id = _cobertura_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_COBERTURA_NAO_ENCONTRADA'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = c.ocorrencia_id;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;

  IF _aprovar THEN
    v_status := 'aprovada';
    UPDATE public.dp_ocorrencia_coberturas SET
      status = 'aprovada',
      aprovado_por = auth.uid(),
      aprovado_em = now()
    WHERE id = _cobertura_id;
  ELSE
    v_status := 'recusada';
    UPDATE public.dp_ocorrencia_coberturas SET
      status = 'recusada',
      motivo_recusa = NULLIF(btrim(COALESCE(_motivo_recusa,'')),''),
      aprovado_por = auth.uid(),
      aprovado_em = now()
    WHERE id = _cobertura_id;
  END IF;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
  VALUES (o.company_id, c.ocorrencia_id, 'cobertura_decidida', 'status', c.status::text, v_status, auth.uid());

  PERFORM public.dp_notificar_criador_ocorrencia(c.ocorrencia_id,
    CASE WHEN _aprovar THEN 'Cobertura aprovada' ELSE 'Cobertura recusada' END,
    CASE WHEN _aprovar THEN 'A cobertura proposta foi aprovada.' ELSE COALESCE('Motivo: ' || _motivo_recusa, 'A cobertura proposta foi recusada.') END);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_cobertura_confirmar(
  _cobertura_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c record;
  o record;
BEGIN
  SELECT * INTO c FROM public.dp_ocorrencia_coberturas WHERE id = _cobertura_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_COBERTURA_NAO_ENCONTRADA'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = c.ocorrencia_id;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  IF c.status <> 'aprovada' THEN
    RAISE EXCEPTION 'OCORRENCIA_COBERTURA_NAO_APROVADA';
  END IF;

  UPDATE public.dp_ocorrencia_coberturas SET
    execucao_status = 'realizada',
    realizado_confirmado_por = auth.uid(),
    realizado_confirmado_em = now()
  WHERE id = _cobertura_id;

  UPDATE public.dp_ocorrencias SET relevancia_operacional = false
   WHERE id = c.ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_novo, autor_id)
  VALUES (o.company_id, c.ocorrencia_id, 'cobertura_realizada', 'execucao_status', 'realizada', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_confirmar(
  _ocorrencia_id uuid,
  _horario_real time without time zone DEFAULT NULL,
  _justificativa_final text DEFAULT NULL,
  _confirmar_falta boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE o record; v_novo public.dp_ocorrencia_tipo; v_min integer; v_self uuid;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_of(auth.uid());
  IF NOT private.is_company_member(auth.uid(), o.company_id) AND v_self IS DISTINCT FROM o.colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;

  v_novo := CASE o.tipo
    WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
    WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
    WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
    WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
    ELSE o.tipo END;

  IF NOT _confirmar_falta THEN
    UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''),'Não se confirmou')
      WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'ocorrencia_cancelada', auth.uid());
    RETURN;
  END IF;

  IF _horario_real IS NOT NULL AND o.horario_previsto IS NOT NULL THEN
    v_min := ABS(EXTRACT(EPOCH FROM (_horario_real - o.horario_previsto)) / 60)::int;
  END IF;

  UPDATE public.dp_ocorrencias SET
    tipo = v_novo,
    estado = 'confirmada',
    horario_real = COALESCE(_horario_real, horario_real),
    minutos = COALESCE(v_min, minutos),
    justificativa_final = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''), justificativa_final),
    relevancia_operacional = COALESCE((
      SELECT relevancia FROM public.dp_ocorrencia_tipo_config WHERE company_id = o.company_id AND tipo = v_novo
    ), true)
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'previsao_confirmada', 'tipo', o.tipo::text, v_novo::text,
          jsonb_build_object('horario_real', _horario_real, 'minutos', v_min), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_notificar_admins_empresa(
  _company_id uuid,
  _tipo text,
  _titulo text,
  _descricao text,
  _ref_table text,
  _ref_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _user_id uuid;
BEGIN
  FOR _user_id IN
    SELECT cm.user_id FROM public.company_members cm
     WHERE cm.company_id = _company_id
       AND cm.role IN ('admin','owner')
  LOOP
    INSERT INTO public.dp_notificacoes (company_id, user_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (_company_id, _user_id, _tipo, _titulo, _descricao, _ref_table, _ref_id, true);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_notificar_criador_ocorrencia(
  _ocorrencia_id uuid,
  _titulo text,
  _descricao text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id;
  IF o.id IS NULL OR o.criado_por IS NULL THEN RETURN; END IF;
  INSERT INTO public.dp_notificacoes (company_id, user_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (o.company_id, o.criado_por, 'ocorrencia', _titulo, _descricao, 'dp_ocorrencias', _ocorrencia_id, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_criar TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_decidir TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_confirmar TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_confirmar TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_notificar_admins_empresa TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_notificar_criador_ocorrencia TO authenticated, service_role;