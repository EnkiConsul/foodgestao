CREATE TABLE public.dp_colaborador_excedente_ciencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  colaborador_nome text,
  de_qtd int NOT NULL,
  para_qtd int NOT NULL,
  limite int NOT NULL,
  valor_unit_cents int NOT NULL,
  colaborador_id uuid,
  usado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dp_colaborador_excedente_ciencias TO authenticated;
GRANT ALL ON public.dp_colaborador_excedente_ciencias TO service_role;
ALTER TABLE public.dp_colaborador_excedente_ciencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "excedente_ciencias_gestao_le" ON public.dp_colaborador_excedente_ciencias
  FOR SELECT TO authenticated USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public._dp_excedente_pode_gerir(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    private.is_company_admin_or_owner(auth.uid(), _company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company AND c.user_id = auth.uid())
    OR public.tem_permissao(_company, 'dp.colaboradores', 'inclusao'))
$$;
REVOKE ALL ON FUNCTION public._dp_excedente_pode_gerir(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._dp_excedente_pode_gerir(uuid) TO service_role;

-- Prévia: quantos há, franquia e custo do excedente (lida pelo app antes de salvar).
CREATE OR REPLACE FUNCTION public.dp_colaborador_excedente_previa(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l jsonb; v_lim int; v_used int; v_preco int;
BEGIN
  IF auth.uid() IS NULL OR NOT public._is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  l := public.assinatura_limites(_company_id, 'pessoas');
  v_lim := COALESCE((l->'limits'->>'colaboradores')::int, -1);
  v_used := COALESCE((l->'used'->>'colaboradores')::int, 0);
  SELECT price_cents INTO v_preco FROM public.plan_addons WHERE module='pessoas' AND code='colaboradores' AND is_active LIMIT 1;
  RETURN jsonb_build_object(
    'modo', public.checkout_v2_mode(),
    'pode_gerir', public._dp_excedente_pode_gerir(_company_id),
    'atual', v_used, 'limite', v_lim, 'isento', COALESCE((l->>'exempt')::boolean, false),
    'valor_unit_cents', COALESCE(v_preco, 0));
END $$;
REVOKE ALL ON FUNCTION public.dp_colaborador_excedente_previa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_excedente_previa(uuid) TO authenticated, service_role;

-- Confirmação: registra a ciência no histórico (auditoria + conta de cobrança).
CREATE OR REPLACE FUNCTION public.dp_colaborador_excedente_confirmar(_company_id uuid, _colaborador_nome text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p jsonb; v_id uuid; v_conta uuid;
BEGIN
  IF public.checkout_v2_mode() <> 'v2' THEN RAISE EXCEPTION 'EXCEDENTE_INDISPONIVEL'; END IF;
  IF NOT public._dp_excedente_pode_gerir(_company_id) THEN RAISE EXCEPTION 'EXCEDENTE_SEM_PERMISSAO'; END IF;
  p := public.dp_colaborador_excedente_previa(_company_id);
  INSERT INTO public.dp_colaborador_excedente_ciencias(company_id,user_id,colaborador_nome,de_qtd,para_qtd,limite,valor_unit_cents)
  VALUES (_company_id, auth.uid(), upper(btrim(_colaborador_nome)), (p->>'atual')::int, (p->>'atual')::int + 1,
          (p->>'limite')::int, (p->>'valor_unit_cents')::int)
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'colaborador_excedente_confirmado', 'company', _company_id::text,
          p || jsonb_build_object('ciencia_id', v_id, 'para', (p->>'atual')::int + 1, 'colaborador', _colaborador_nome));
  SELECT billing_account_id INTO v_conta FROM public.billing_account_companies
   WHERE company_id = _company_id AND removed_at IS NULL LIMIT 1;
  IF v_conta IS NOT NULL THEN
    INSERT INTO public.billing_account_events(billing_account_id, tipo_evento, actor_id, payload)
    VALUES (v_conta, 'colaborador_excedente_confirmado', auth.uid(),
            jsonb_build_object('company_id', _company_id, 'ciencia_id', v_id, 'de', (p->>'atual')::int,
              'para', (p->>'atual')::int + 1, 'limite', (p->>'limite')::int, 'valor_unit_cents', (p->>'valor_unit_cents')::int,
              'colaborador', _colaborador_nome));
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_colaborador_excedente_confirmar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_excedente_confirmar(uuid, text) TO authenticated, service_role;

-- Trava: legado bloqueia; v2 libera só gestão com ciência registrada nos últimos 15 minutos.
CREATE OR REPLACE FUNCTION public.dp_guard_limite_colaborador()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c uuid;
BEGIN
  IF NOT (NEW.ativo AND NEW.desligado_em IS NULL
          AND public.assinatura_limite_excedido(NEW.company_id, 'pessoas', 'colaboradores')) THEN
    RETURN NULL;
  END IF;
  IF public.checkout_v2_mode() <> 'v2' THEN
    RAISE EXCEPTION 'Limite do plano atingido: não é possível incluir mais colaboradores. Contrate um adicional para ampliar o limite.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public._dp_excedente_pode_gerir(NEW.company_id) THEN
    RAISE EXCEPTION 'EXCEDENTE_SEM_PERMISSAO' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id INTO v_c FROM public.dp_colaborador_excedente_ciencias
   WHERE company_id = NEW.company_id AND user_id = auth.uid() AND usado_em IS NULL
     AND created_at > now() - interval '15 minutes'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_c IS NULL THEN
    RAISE EXCEPTION 'EXCEDENTE_CONFIRMACAO_NECESSARIA' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.dp_colaborador_excedente_ciencias SET usado_em = now(), colaborador_id = NEW.id WHERE id = v_c;
  RETURN NULL;
END $$;