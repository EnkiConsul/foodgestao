DROP FUNCTION IF EXISTS public.company_access_status(uuid);

CREATE OR REPLACE FUNCTION public.company_access_status(_company_id uuid)
RETURNS TABLE (
  company_id uuid,
  is_owner boolean,
  status text,
  trial_ends_at timestamptz,
  blocked boolean,
  motivo text,
  dias_atraso integer,
  can_export boolean,
  valor_pendente_cents integer,
  fatura_pendente_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_sub record;
  v_atraso integer;
  v_fatura record;
  -- melhor resultado entre as assinaturas do dono
  v_best_blocked boolean := true;
  v_best_status text := NULL;
  v_best_trial timestamptz := NULL;
  v_best_motivo text := 'sem_assinatura';
  v_best_atraso integer := NULL;
  v_best_valor integer := NULL;
  v_best_fatura uuid := NULL;
  v_cur_motivo text;
  v_encontrou boolean := false;
BEGIN
  IF v_uid IS NULL OR _company_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c.user_id INTO v_owner FROM public.companies c WHERE c.id = _company_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  -- só quem tem vínculo com a empresa pode consultar
  IF v_owner <> v_uid AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = v_uid
  ) THEN
    RETURN;
  END IF;

  FOR v_sub IN
    SELECT s.*
    FROM public.subscriptions s
    WHERE s.user_id = v_owner
    ORDER BY s.created_at DESC
  LOOP
    v_encontrou := true;
    v_atraso := NULL;
    v_cur_motivo := NULL;

    -- fatura em aberto mais antiga vencida
    SELECT i.id, i.amount_cents, i.due_date
      INTO v_fatura
    FROM public.invoices i
    WHERE i.subscription_id = v_sub.id
      AND i.status IN ('open', 'overdue')
      AND i.due_date < current_date
    ORDER BY i.due_date ASC
    LIMIT 1;

    IF v_fatura.id IS NOT NULL THEN
      v_atraso := (current_date - v_fatura.due_date)::integer;
    END IF;

    IF v_sub.is_exempt IS TRUE
       AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until >= now()) THEN
      -- cortesia vigente: acesso liberado
      v_cur_motivo := NULL;
    ELSIF v_sub.status = 'trialing' THEN
      -- fim do teste sem plano contratado: bloqueio imediato
      IF v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at < now() THEN
        v_cur_motivo := 'trial_expirado';
      END IF;
    ELSIF v_sub.status IN ('expired', 'canceled') THEN
      v_cur_motivo := CASE
        WHEN v_atraso IS NOT NULL AND v_atraso > 90 THEN 'expirado_definitivo'
        ELSE 'rescindido'
      END;
    ELSIF v_sub.status IN ('active', 'past_due', 'pending') THEN
      IF v_atraso IS NULL OR v_atraso <= 10 THEN
        v_cur_motivo := NULL;  -- em dia ou dentro da tolerância de 10 dias
      ELSIF v_atraso <= 30 THEN
        v_cur_motivo := 'inadimplente_suspenso';
      ELSIF v_atraso <= 90 THEN
        v_cur_motivo := 'rescindido';
      ELSE
        v_cur_motivo := 'expirado_definitivo';
      END IF;
    ELSE
      v_cur_motivo := 'sem_assinatura';
    END IF;

    IF v_cur_motivo IS NULL THEN
      -- assinatura vigente encontrada: libera e encerra
      RETURN QUERY SELECT
        _company_id,
        (v_owner = v_uid),
        v_sub.status::text,
        v_sub.trial_ends_at,
        false,
        NULL::text,
        v_atraso,
        true,
        v_fatura.amount_cents,
        v_fatura.id;
      RETURN;
    END IF;

    -- guarda o bloqueio mais brando entre as assinaturas
    IF v_best_status IS NULL
       OR (v_best_motivo = 'expirado_definitivo' AND v_cur_motivo <> 'expirado_definitivo') THEN
      v_best_status := v_sub.status::text;
      v_best_trial := v_sub.trial_ends_at;
      v_best_motivo := v_cur_motivo;
      v_best_atraso := v_atraso;
      v_best_valor := v_fatura.amount_cents;
      v_best_fatura := v_fatura.id;
    END IF;
  END LOOP;

  IF NOT v_encontrou THEN
    v_best_motivo := 'sem_assinatura';
  END IF;

  RETURN QUERY SELECT
    _company_id,
    (v_owner = v_uid),
    v_best_status,
    v_best_trial,
    true,
    v_best_motivo,
    v_best_atraso,
    (v_best_motivo <> 'expirado_definitivo'),
    v_best_valor,
    v_best_fatura;
END;
$$;

REVOKE ALL ON FUNCTION public.company_access_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_access_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_access_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_access_status(uuid) TO service_role;