
-- =========================================================
-- Bloco 2: modelo de dados para login unificado 360°FOOD
-- =========================================================

-- ---------- 1. auth_login_identifiers ----------
CREATE TABLE public.auth_login_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identifier_type text NOT NULL CHECK (identifier_type IN ('cpf')),
  identifier_hash text NOT NULL,
  identifier_last4 text NULL,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_login_identifiers_type_hash_key UNIQUE (identifier_type, identifier_hash)
);
CREATE INDEX auth_login_identifiers_user_idx ON public.auth_login_identifiers(user_id);

GRANT ALL ON public.auth_login_identifiers TO service_role;
-- sem GRANT para anon/authenticated: acesso exclusivo backend
ALTER TABLE public.auth_login_identifiers ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy criada => nega tudo para anon/authenticated. service_role bypassa RLS.

-- ---------- 2. auth_user_security_state ----------
CREATE TABLE public.auth_user_security_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  must_change_password boolean NOT NULL DEFAULT false,
  provisional_password_issued_at timestamptz NULL,
  provisional_password_expires_at timestamptz NULL,
  password_changed_at timestamptz NULL,
  password_changed_by uuid NULL,
  access_blocked boolean NOT NULL DEFAULT false,
  blocked_at timestamptz NULL,
  blocked_by uuid NULL,
  block_reason text NULL,
  sessions_revoked_at timestamptz NULL,
  last_context jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_user_security_state TO authenticated;
GRANT ALL ON public.auth_user_security_state TO service_role;

ALTER TABLE public.auth_user_security_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own security state readable"
  ON public.auth_user_security_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- writes só via service_role (nenhuma policy de write para authenticated)

-- ---------- 3. auth_recovery_challenges ----------
CREATE TABLE public.auth_recovery_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  identifier_hash text NOT NULL,
  challenge_token_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_identity','pending_otp','verified','completed','expired','blocked')),
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  identity_verified_at timestamptz NULL,
  otp_hash text NULL,
  otp_expires_at timestamptz NULL,
  otp_attempt_count integer NOT NULL DEFAULT 0,
  otp_sent_at timestamptz NULL,
  otp_channel text NULL,
  whatsapp_message_id text NULL,
  whatsapp_delivery_status text NULL,
  otp_verified_at timestamptz NULL,
  reset_token_hash text NULL,
  reset_token_expires_at timestamptz NULL,
  completed_at timestamptz NULL,
  ip_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_recovery_challenges_user_idx ON public.auth_recovery_challenges(user_id);
CREATE INDEX auth_recovery_challenges_hash_idx ON public.auth_recovery_challenges(identifier_hash);
CREATE INDEX auth_recovery_challenges_status_idx ON public.auth_recovery_challenges(status);

GRANT ALL ON public.auth_recovery_challenges TO service_role;
ALTER TABLE public.auth_recovery_challenges ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy => acesso exclusivo backend.

-- ---------- 4. auth_rate_limits ----------
CREATE TABLE public.auth_rate_limits (
  bucket text NOT NULL,
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NULL,
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX auth_rate_limits_window_idx ON public.auth_rate_limits(window_start);

GRANT ALL ON public.auth_rate_limits TO service_role;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy => acesso exclusivo backend.

-- ---------- 5. Trigger de updated_at (reaproveita se já existir) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $fn$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $fn$ LANGUAGE plpgsql SET search_path = public;
  END IF;
END $$;

CREATE TRIGGER auth_login_identifiers_updated_at BEFORE UPDATE ON public.auth_login_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER auth_user_security_state_updated_at BEFORE UPDATE ON public.auth_user_security_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER auth_recovery_challenges_updated_at BEFORE UPDATE ON public.auth_recovery_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 6. RPC: is_password_change_required ----------
CREATE OR REPLACE FUNCTION public.is_password_change_required()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT must_change_password FROM public.auth_user_security_state WHERE user_id = auth.uid()),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_password_change_required() TO authenticated;

-- ---------- 7. RPC: auth_access_enabled ----------
CREATE OR REPLACE FUNCTION public.auth_access_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT COALESCE(
    (SELECT access_blocked FROM public.auth_user_security_state WHERE user_id = auth.uid()),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.auth_access_enabled() TO authenticated;

-- ---------- 8. RPC: get_my_access_contexts ----------
CREATE OR REPLACE FUNCTION public.get_my_access_contexts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_super boolean;
  v_companies jsonb;
  v_dp jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('super_admin', false, 'companies', '[]'::jsonb, 'dp_contexts', '[]'::jsonb);
  END IF;

  v_super := public.has_role(v_uid, 'super_admin'::app_role);

  -- Empresas: owner (companies.user_id) + memberships
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'company_id', c.id,
    'company_name', c.name,
    'role', ctx.role,
    'is_owner', ctx.is_owner
  )), '[]'::jsonb)
  INTO v_companies
  FROM companies c
  JOIN LATERAL (
    SELECT 'owner'::text AS role, true AS is_owner
    WHERE c.user_id = v_uid
    UNION ALL
    SELECT m.role::text, (m.role::text = 'owner')
    FROM company_members m
    WHERE m.company_id = c.id AND m.user_id = v_uid
  ) ctx ON true
  WHERE COALESCE(c.is_active, true) = true;

  -- Contextos DP: apenas colaboradores ativos + aprovados + empresa ativa
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'company_id', d.company_id,
    'company_name', c.name,
    'colaborador_id', d.id,
    'perfil_acesso', d.perfil_acesso
  )), '[]'::jsonb)
  INTO v_dp
  FROM dp_colaboradores d
  JOIN companies c ON c.id = d.company_id
  WHERE d.user_id = v_uid
    AND COALESCE(d.ativo, true) = true
    AND COALESCE(c.is_active, true) = true;

  RETURN jsonb_build_object(
    'super_admin', v_super,
    'companies', v_companies,
    'dp_contexts', v_dp
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_access_contexts() TO authenticated;

-- ---------- 9. Revogar resolve_cpf_login ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_cpf_login' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE ALL ON FUNCTION public.resolve_cpf_login(text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ---------- 10. Comentários ----------
COMMENT ON TABLE public.auth_login_identifiers IS 'Aliases de login (ex.: CPF) armazenados como HMAC. Acesso exclusivo service_role.';
COMMENT ON TABLE public.auth_user_security_state IS 'Estado de segurança por usuário: must_change_password, bloqueio, expiração de senha provisória.';
COMMENT ON TABLE public.auth_recovery_challenges IS 'Desafios de recuperação de senha por CPF+WhatsApp+OTP.';
COMMENT ON TABLE public.auth_rate_limits IS 'Rate limit persistente para login e recuperação.';
