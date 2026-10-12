CREATE TABLE public.signup_whatsapp_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  sends int NOT NULL DEFAULT 1,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX signup_whatsapp_otps_user_idx ON public.signup_whatsapp_otps(user_id);
GRANT ALL ON public.signup_whatsapp_otps TO service_role;
ALTER TABLE public.signup_whatsapp_otps ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.signup_whatsapp_otps IS 'Código de confirmação do cadastro por WhatsApp; acesso só pelo servidor (signup-whatsapp-otp).';