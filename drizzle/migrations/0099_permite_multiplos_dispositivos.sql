ALTER TABLE public.auth_user_security_state
  ADD COLUMN IF NOT EXISTS permite_multiplos_dispositivos boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.auth_user_security_state.permite_multiplos_dispositivos IS 'Exceção à sessão única: permite login simultâneo em vários aparelhos (cada um autentica separadamente). Gravado só pelo servidor.';