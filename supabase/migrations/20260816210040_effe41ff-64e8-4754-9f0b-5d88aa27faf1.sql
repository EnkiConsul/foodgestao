
-- ============ CASES ============
CREATE TABLE public.mkt_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  company_name text,
  segment text,
  modules text[] NOT NULL DEFAULT '{}',
  challenge text,
  solution text,
  result text,
  body text,
  cover_url text,
  cover_alt text,
  seo_title text,
  seo_description text,
  is_demo boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_cases TO anon, authenticated;
GRANT ALL ON public.mkt_cases TO service_role;
ALTER TABLE public.mkt_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_cases public read published" ON public.mkt_cases FOR SELECT TO anon, authenticated USING (published = true AND is_demo = false);
CREATE POLICY "mkt_cases super admin all" ON public.mkt_cases FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ DEPOIMENTOS ============
CREATE TABLE public.mkt_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL,
  author_role text,
  company_name text,
  photo_url text,
  quote text NOT NULL,
  module text,
  is_demo boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_testimonials TO anon, authenticated;
GRANT ALL ON public.mkt_testimonials TO service_role;
ALTER TABLE public.mkt_testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_testimonials public read published" ON public.mkt_testimonials FOR SELECT TO anon, authenticated USING (published = true AND is_demo = false);
CREATE POLICY "mkt_testimonials super admin all" ON public.mkt_testimonials FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ BLOG ============
CREATE TABLE public.mkt_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  body text,
  category text,
  author_name text,
  reviewer_name text,
  cover_url text,
  cover_alt text,
  focus_keyword text,
  seo_title text,
  seo_description text,
  canonical_url text,
  published boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  published_at timestamptz,
  updated_content_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_posts TO anon, authenticated;
GRANT ALL ON public.mkt_posts TO service_role;
ALTER TABLE public.mkt_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_posts public read published" ON public.mkt_posts FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "mkt_posts super admin all" ON public.mkt_posts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ FAQ ============
CREATE TABLE public.mkt_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  scope text NOT NULL DEFAULT 'home',
  published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mkt_faqs_scope_check CHECK (scope IN ('home','financeiro','dp','planos'))
);
GRANT SELECT ON public.mkt_faqs TO anon, authenticated;
GRANT ALL ON public.mkt_faqs TO service_role;
ALTER TABLE public.mkt_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_faqs public read published" ON public.mkt_faqs FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "mkt_faqs super admin all" ON public.mkt_faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ LOGOS DE CLIENTES ============
CREATE TABLE public.mkt_client_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text NOT NULL,
  alt_text text,
  published boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_client_logos TO anon, authenticated;
GRANT ALL ON public.mkt_client_logos TO service_role;
ALTER TABLE public.mkt_client_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_client_logos public read published" ON public.mkt_client_logos FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "mkt_client_logos super admin all" ON public.mkt_client_logos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ CONFIGURAÇÕES DO SITE ============
CREATE TABLE public.mkt_site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_site_settings TO anon, authenticated;
GRANT ALL ON public.mkt_site_settings TO service_role;
ALTER TABLE public.mkt_site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_site_settings public read" ON public.mkt_site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "mkt_site_settings super admin all" ON public.mkt_site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============ LEADS ============
CREATE TABLE public.mkt_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  company_name text,
  cnpj_count int,
  unit_count int,
  business_type text,
  interest text,
  headcount_range text,
  message text,
  consent boolean NOT NULL DEFAULT false,
  source_page text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  status text NOT NULL DEFAULT 'novo',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mkt_leads TO service_role;
ALTER TABLE public.mkt_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_leads super admin read" ON public.mkt_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "mkt_leads super admin update" ON public.mkt_leads FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT, UPDATE ON public.mkt_leads TO authenticated;
CREATE INDEX mkt_leads_created_at_idx ON public.mkt_leads (created_at DESC);
CREATE INDEX mkt_leads_ip_hash_idx ON public.mkt_leads (ip_hash, created_at DESC);

-- updated_at triggers
CREATE TRIGGER mkt_cases_updated_at BEFORE UPDATE ON public.mkt_cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mkt_testimonials_updated_at BEFORE UPDATE ON public.mkt_testimonials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mkt_posts_updated_at BEFORE UPDATE ON public.mkt_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mkt_faqs_updated_at BEFORE UPDATE ON public.mkt_faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mkt_client_logos_updated_at BEFORE UPDATE ON public.mkt_client_logos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER mkt_site_settings_updated_at BEFORE UPDATE ON public.mkt_site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FAQs iniciais (conteúdo real, sem números inventados)
INSERT INTO public.mkt_faqs (question, answer, scope, sort_order) VALUES
('O 360°FOOD é indicado para quais negócios?', 'A plataforma foi desenhada para bares, restaurantes, lanchonetes, cafeterias, pizzarias, dark kitchens, buffets e redes de unidades de alimentação.', 'home', 1),
('Posso contratar apenas um módulo?', 'Sim. Você pode contratar o Financeiro 360°, o DP 360° ou os dois. A contratação é modular e você paga apenas pelo que usar.', 'home', 2),
('Consigo administrar mais de uma empresa?', 'Sim, conforme o plano contratado. O plano Multiempresa do Financeiro permite gerenciar até 3 CNPJs no mesmo ambiente.', 'home', 3),
('O Financeiro conecta com bancos?', 'Sim, por meio de Open Finance. A disponibilidade depende da instituição financeira. Também é possível importar movimentações do extrato e conciliar manualmente.', 'home', 4),
('Meu contador pode acessar?', 'Sim. Existe um perfil de acesso específico para contabilidade, com visão de leitura das informações financeiras.', 'home', 5),
('O DP faz folha de pagamento ou ponto eletrônico?', 'Não. O escopo atual do DP 360° não inclui folha de pagamento completa nem registro de ponto eletrônico. O módulo organiza colaboradores, escalas, folgas, férias, documentos, solicitações e comunicação.', 'home', 6),
('O sistema funciona no celular?', 'Sim. Você acessa pelo computador, tablet ou celular usando o navegador, sem precisar instalar nada.', 'home', 7),
('Como funciona a Fidelidade 360?', 'É um programa promocional do Financeiro: ao permanecer 12 meses, você paga apenas 9 mensalidades — o 1º, o 5º e o 9º mês são gratuitos. A condição está sujeita aos termos da oferta.', 'home', 8),
('Como meus dados são protegidos?', 'Os dados ficam isolados por empresa, com regras de acesso por perfil e controle de permissões. Tratamos dados pessoais conforme a LGPD e a nossa Política de Privacidade.', 'home', 9),
('Preciso de cartão de crédito para conhecer a plataforma?', 'Não. O cadastro inicial é feito com seus dados de contato e você conhece o ambiente antes de contratar.', 'financeiro', 1),
('O Financeiro substitui meu contador?', 'Não. Ele organiza a informação gerencial e facilita o envio de dados para a contabilidade, com acesso dedicado para o contador.', 'financeiro', 2),
('Consigo separar custos por área da operação?', 'Sim. Você pode usar centros de custo como cozinha, bar, salão, delivery, marketing e administrativo, além de categorias e subcategorias.', 'financeiro', 3),
('O DP 360° tem preço publicado?', 'Ainda não. Os planos do DP 360° são apresentados sob consulta. Fale com nosso time para conhecer as condições.', 'dp', 1),
('O colaborador precisa de e-mail para acessar o portal?', 'Não necessariamente. O acesso do colaborador pode ser feito por CPF, com senha própria.', 'dp', 2),
('O DP controla banco de horas e apuração de ponto?', 'Não no escopo atual. O DP 360° apoia a organização de escalas, folgas, férias, documentos e comunicação da equipe.', 'dp', 3);

INSERT INTO public.mkt_site_settings (key, value) VALUES
('contact', '{"email":"contato@gestor360food.com","whatsapp":"+5562992365959","whatsapp_label":"(62) 99236-5959","address":"","hours":"Segunda a sexta, 8h às 18h","instagram":"","linkedin":"","facebook":"","placeholder_notice":"Endereço e redes sociais aguardam preenchimento."}'::jsonb);
