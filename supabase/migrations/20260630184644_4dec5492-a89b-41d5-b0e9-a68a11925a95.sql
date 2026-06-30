
CREATE TABLE IF NOT EXISTS public.banks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT,
  logo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.banks TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.banks TO authenticated;
GRANT ALL ON public.banks TO service_role;

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read active banks"
  ON public.banks FOR SELECT
  TO authenticated, anon
  USING (is_active = true OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can insert banks"
  ON public.banks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can update banks"
  ON public.banks FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete banks"
  ON public.banks FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_banks_updated_at
  BEFORE UPDATE ON public.banks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.banks (slug, name, domain, sort_order) VALUES
  ('nubank', 'Nubank', 'nubank.com.br', 10),
  ('itau', 'Itaú', 'itau.com.br', 20),
  ('bradesco', 'Bradesco', 'bradesco.com.br', 30),
  ('santander', 'Santander', 'santander.com.br', 40),
  ('caixa', 'Caixa Econômica Federal', 'caixa.gov.br', 50),
  ('bb', 'Banco do Brasil', 'bb.com.br', 60),
  ('inter', 'Banco Inter', 'bancointer.com.br', 70),
  ('c6', 'C6 Bank', 'c6bank.com.br', 80),
  ('btg', 'BTG Pactual', 'btgpactual.com', 90),
  ('sicoob', 'Sicoob', 'sicoob.com.br', 100),
  ('sicredi', 'Sicredi', 'sicredi.com.br', 110),
  ('original', 'Banco Original', 'original.com.br', 120),
  ('next', 'Next', 'next.me', 130),
  ('picpay', 'PicPay', 'picpay.com', 140),
  ('mercadopago', 'Mercado Pago', 'mercadopago.com.br', 150),
  ('will', 'Will Bank', 'willbank.com.br', 160),
  ('neon', 'Neon', 'neon.com.br', 170),
  ('pan', 'Banco Pan', 'bancopan.com.br', 180),
  ('safra', 'Safra', 'safra.com.br', 190),
  ('xp', 'XP Investimentos', 'xpi.com.br', 200),
  ('rico', 'Rico', 'rico.com.vc', 210),
  ('modal', 'Modalmais', 'modalmais.com.br', 220),
  ('banrisul', 'Banrisul', 'banrisul.com.br', 230),
  ('votorantim', 'Banco BV', 'bv.com.br', 240),
  ('daycoval', 'Daycoval', 'daycoval.com.br', 250),
  ('ame', 'Ame Digital', 'amedigital.com', 260),
  ('pagseguro', 'PagBank', 'pagseguro.uol.com.br', 270),
  ('stone', 'Stone', 'stone.com.br', 280)
ON CONFLICT (slug) DO NOTHING;
