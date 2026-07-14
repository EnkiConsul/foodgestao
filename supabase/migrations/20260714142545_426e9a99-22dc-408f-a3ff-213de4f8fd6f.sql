-- 1) Adicionar colunas em categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS template_code TEXT,
  ADD COLUMN IF NOT EXISTS category_subtype TEXT,
  ADD COLUMN IF NOT EXISTS ai_description TEXT,
  ADD COLUMN IF NOT EXISTS previous_index TEXT,
  ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS categories_template_unique
  ON public.categories(user_id, company_id, template_code)
  WHERE template_code IS NOT NULL;

-- 2) Catálogo mestre
CREATE TABLE IF NOT EXISTS public.category_templates (
  code TEXT PRIMARY KEY,
  parent_code TEXT REFERENCES public.category_templates(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INT NOT NULL,
  sort_order INT NOT NULL,
  subtype TEXT NOT NULL,
  transaction_type transaction_type NOT NULL,
  ai_description TEXT,
  previous_index TEXT,
  is_customizable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.category_templates TO authenticated;
GRANT ALL ON public.category_templates TO service_role;

ALTER TABLE public.category_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Any authenticated user reads templates" ON public.category_templates;
CREATE POLICY "Any authenticated user reads templates"
  ON public.category_templates FOR SELECT TO authenticated USING (true);

-- 3) Seed dos 69 templates
INSERT INTO public.category_templates (code, parent_code, name, level, sort_order, subtype, transaction_type, ai_description, previous_index, is_customizable) VALUES
  ('CAT000001', NULL, 'RECEITAS', 1, 1, 'receita', 'receita', 'Agrupa todas as entradas financeiras provenientes das atividades da empresa, como vendas, serviços, delivery, cartões, PIX, dinheiro e outras receitas.', '1.', false),
  ('CAT000002', 'CAT000001', 'Receitas Operacionais', 2, 2, 'receita', 'receita', 'Agrupa as receitas geradas diretamente pelas vendas e pela operação principal do bar ou restaurante.', 'Categoria incluída', true),
  ('CAT000003', 'CAT000002', 'Receitas Cartão Crédito', 3, 3, 'receita', 'receita', 'Recebimentos provenientes de vendas pagas por cartão de crédito; não incluir empréstimos, aportes ou transferências entre contas.', '1.11.', true),
  ('CAT000004', 'CAT000002', 'Receitas Cartão Débito', 3, 4, 'receita', 'receita', 'Recebimentos provenientes de vendas realizadas por cartão de débito.', '1.12.', true),
  ('CAT000005', 'CAT000002', 'Receitas PIX', 3, 5, 'receita', 'receita', 'Recebimentos de clientes efetuados via PIX por vendas de produtos ou serviços; não incluir transferências entre contas próprias.', '1.13.', true),
  ('CAT000006', 'CAT000002', 'Receitas Dinheiro', 3, 6, 'receita', 'receita', 'Vendas e demais receitas operacionais recebidas em espécie no caixa do estabelecimento.', '1.15.', true),
  ('CAT000007', 'CAT000002', 'Receitas Venda Chopp Atacado', 3, 7, 'receita', 'receita', 'Receitas provenientes da venda de chopp no atacado para clientes, revendedores, eventos ou parceiros comerciais.', '1.20.', true),
  ('CAT000008', 'CAT000001', 'RECEITAS FINANCEIRAS', 2, 8, 'receita', 'receita', 'Entradas provenientes de rendimentos financeiros, juros recebidos, descontos obtidos e aplicações financeiras.', '1.5.', true),
  ('CAT000009', 'CAT000008', 'Receita Multa e Juros de Clientes', 3, 9, 'receita', 'receita', 'Recebimentos de multas contratuais, juros por atraso e encargos cobrados de clientes.', '1.5.1.', true),
  ('CAT000010', 'CAT000008', 'Receita Financeira de Aplicações', 3, 10, 'receita', 'receita', 'Rendimentos de CDB, fundos, poupança, Tesouro Direto, aplicações automáticas e outros investimentos.', '1.5.2.', true),
  ('CAT000011', 'CAT000008', 'Receita de Descontos Obtidos', 3, 11, 'receita', 'receita', 'Ganhos decorrentes de descontos concedidos por fornecedores em pagamentos ou negociações financeiras.', '1.5.3.', true),
  ('CAT000012', 'CAT000001', 'RECEITAS DIVERSAS', 2, 12, 'receita', 'receita', 'Agrupa receitas eventuais que não estejam diretamente relacionadas à atividade principal do estabelecimento.', '1.10.', true),
  ('CAT000013', 'CAT000012', 'Receitas Diversas', 3, 13, 'receita', 'receita', 'Entradas ocasionais como reembolsos, indenizações, venda de sucata e outras receitas sem categoria específica.', '1.10.1.', true),
  ('CAT000014', NULL, 'SAÍDAS (Impostos, Custos e Despesas)', 1, 14, 'saida', 'despesa', 'Agrupa todos os desembolsos relacionados a impostos, custos, despesas operacionais, despesas financeiras e investimentos.', '2.', false),
  ('CAT000015', 'CAT000014', 'IMPOSTOS E TRIBUTOS SOBRE FATURAMENTO', 2, 15, 'imposto', 'despesa', 'Tributos calculados sobre vendas, faturamento ou prestação de serviços do estabelecimento.', '2.1.', true),
  ('CAT000016', 'CAT000015', 'IMPOSTOS E TRIBUTOS SOBRE VENDAS', 3, 16, 'imposto', 'despesa', 'Agrupa os tributos diretamente relacionados às vendas e ao faturamento.', '2.1.1.', true),
  ('CAT000017', 'CAT000016', 'ICMS sobre Vendas', 4, 17, 'imposto', 'despesa', 'Pagamentos e provisões de ICMS incidentes sobre a comercialização de produtos e mercadorias.', '2.1.1.1.', true),
  ('CAT000018', 'CAT000016', 'ISS sobre Vendas', 4, 18, 'imposto', 'despesa', 'Pagamentos e provisões de ISS referentes à prestação de serviços.', '2.1.1.2.', true),
  ('CAT000019', 'CAT000016', 'PIS sobre Vendas', 4, 19, 'imposto', 'despesa', 'Pagamentos e provisões de PIS incidentes sobre o faturamento.', '2.1.1.3.', true),
  ('CAT000020', 'CAT000016', 'COFINS sobre Vendas', 4, 20, 'imposto', 'despesa', 'Pagamentos e provisões de COFINS incidentes sobre o faturamento.', '2.1.1.4.', true),
  ('CAT000021', 'CAT000016', 'Simples Nacional', 4, 21, 'imposto', 'despesa', 'Pagamentos da guia DAS do Simples Nacional e ajustes diretamente relacionados.', '2.1.1.5.', true),
  ('CAT000022', 'CAT000014', 'CUSTOS', 2, 22, 'custo', 'despesa', 'Gastos diretamente relacionados à produção e comercialização dos alimentos, bebidas e serviços vendidos.', '2.2.', true),
  ('CAT000023', 'CAT000022', 'CPV - CUSTO DOS PRODUTOS VENDIDOS', 3, 23, 'custo', 'despesa', 'Agrupa os custos diretos dos alimentos, bebidas, embalagens e insumos consumidos nas vendas.', '2.2.16.', true),
  ('CAT000024', 'CAT000023', 'Custos Alimentos', 4, 24, 'custo', 'despesa', 'Compras de carnes, hortifrúti, massas, temperos, laticínios e ingredientes utilizados no preparo dos pratos.', '2.2.16.1.', true),
  ('CAT000025', 'CAT000023', 'Custos Bebidas', 4, 25, 'custo', 'despesa', 'Compras de cervejas, refrigerantes, água, vinhos, destilados, sucos e demais bebidas destinadas à venda.', '2.2.16.2.', true),
  ('CAT000026', 'CAT000023', 'Custos Embalagens', 4, 26, 'custo', 'despesa', 'Compras de marmitas, copos, sacolas, caixas, lacres, talheres e embalagens utilizadas nas vendas e no delivery.', '2.2.16.3.', true),
  ('CAT000027', 'CAT000023', 'Custos Gás de Cozinha', 4, 27, 'custo', 'despesa', 'Compras de GLP ou gás natural consumido diretamente no preparo de alimentos e bebidas.', '2.2.16.4.', true),
  ('CAT000028', 'CAT000022', 'Custos com Pessoal Operacional', 3, 28, 'custo', 'despesa', 'Agrupa remunerações variáveis e mão de obra temporária diretamente ligadas à operação e atendimento.', 'Categoria incluída', true),
  ('CAT000029', 'CAT000028', 'Comissão Garçom', 4, 29, 'custo', 'despesa', 'Comissões e bonificações pagas aos garçons conforme vendas, atendimento ou metas operacionais.', '2.2.9.7.', true),
  ('CAT000030', 'CAT000028', 'Comissão Cozinha', 4, 30, 'custo', 'despesa', 'Comissões, bonificações e gratificações pagas à equipe de cozinha.', '2.2.9.8.', true),
  ('CAT000031', 'CAT000028', 'Custos Freelancer', 4, 31, 'custo', 'despesa', 'Pagamentos a cozinheiros, garçons, auxiliares e outros profissionais temporários contratados para a operação.', '2.2.9.9.', true),
  ('CAT000032', 'CAT000014', 'DESPESAS OPERACIONAIS', 2, 32, 'despesa', 'despesa', 'Despesas necessárias ao funcionamento do estabelecimento que não compõem diretamente o custo dos produtos vendidos.', '2.3.', true),
  ('CAT000033', 'CAT000032', 'Despesas Administrativas', 3, 33, 'despesa', 'despesa', 'Agrupa despesas de estrutura, administração, comunicação, limpeza e tecnologia.', 'Categoria incluída', true),
  ('CAT000034', 'CAT000033', 'Aluguel Administração', 4, 34, 'despesa', 'despesa', 'Pagamentos de aluguel do imóvel utilizado pelo bar, restaurante, escritório ou unidade administrativa.', '2.3.1.1.', true),
  ('CAT000035', 'CAT000033', 'Água e Esgoto', 4, 35, 'despesa', 'despesa', 'Contas de água, saneamento, esgoto e serviços relacionados.', '2.3.1.2.', true),
  ('CAT000036', 'CAT000033', 'Energia Elétrica', 4, 36, 'despesa', 'despesa', 'Contas de energia elétrica consumida pelo estabelecimento.', '2.3.1.3.', true),
  ('CAT000037', 'CAT000033', 'Material de Limpeza', 4, 37, 'despesa', 'despesa', 'Compras de detergentes, desinfetantes, produtos de higiene e materiais para limpeza e conservação.', '2.3.1.4.', true),
  ('CAT000038', 'CAT000033', 'Material de Escritório', 4, 38, 'despesa', 'despesa', 'Compras de papelaria, impressos e materiais utilizados nas rotinas administrativas.', '2.3.1.5.', true),
  ('CAT000039', 'CAT000033', 'Telefone', 4, 39, 'despesa', 'despesa', 'Pagamentos de telefonia fixa, móvel, chips e serviços de comunicação empresarial.', '2.3.1.6.', true),
  ('CAT000040', 'CAT000033', 'Internet', 4, 40, 'despesa', 'despesa', 'Pagamentos de internet, fibra, links corporativos e serviços de conectividade.', '2.3.1.26.', true),
  ('CAT000041', 'CAT000033', 'Sistemas e Tecnologia', 4, 41, 'despesa', 'despesa', 'Mensalidades de ERP, PDV, CRM, aplicativos, softwares SaaS, inteligência artificial, hospedagem e plataformas digitais.', '2.3.1.31.', true),
  ('CAT000042', 'CAT000032', 'DESPESAS COM PESSOAL', 3, 42, 'despesa', 'despesa', 'Agrupa gastos com funcionários, sócios administradores, benefícios e desenvolvimento da equipe.', '2.3.2.', true),
  ('CAT000043', 'CAT000042', 'Salários e Ordenados', 4, 43, 'despesa', 'despesa', 'Pagamentos de salários, ordenados e remunerações fixas dos funcionários.', '2.3.2.1.', true),
  ('CAT000044', 'CAT000042', '13º Salário', 4, 44, 'despesa', 'despesa', 'Pagamentos e provisões do décimo terceiro salário.', '2.3.2.2.', true),
  ('CAT000045', 'CAT000042', 'Férias', 4, 45, 'despesa', 'despesa', 'Pagamentos e provisões de férias, adicional de um terço e valores relacionados.', '2.3.2.3.', true),
  ('CAT000046', 'CAT000042', 'Vale Transporte', 4, 46, 'despesa', 'despesa', 'Aquisições e pagamentos de benefícios de transporte fornecidos aos colaboradores.', '2.3.2.4.', true),
  ('CAT000047', 'CAT000042', 'Alimentação PAT', 4, 47, 'despesa', 'despesa', 'Vale-alimentação, vale-refeição e despesas vinculadas ao Programa de Alimentação do Trabalhador.', '2.3.2.5.', true),
  ('CAT000048', 'CAT000042', 'Plano de Saúde', 4, 48, 'despesa', 'despesa', 'Pagamentos de planos de saúde, assistência médica e benefícios semelhantes.', '2.3.2.7.', true),
  ('CAT000049', 'CAT000042', 'Uniformes e EPI', 4, 49, 'despesa', 'despesa', 'Compras de uniformes, aventais, calçados, luvas e equipamentos de proteção individual.', '2.3.2.12.', true),
  ('CAT000050', 'CAT000042', 'Cursos e Treinamentos', 4, 50, 'despesa', 'despesa', 'Pagamentos de cursos, treinamentos, capacitações e desenvolvimento profissional da equipe.', '2.3.2.13.', true),
  ('CAT000051', 'CAT000042', 'Pró-labore', 4, 51, 'despesa', 'despesa', 'Remuneração periódica dos sócios administradores pelo trabalho realizado na empresa; não incluir distribuição de lucros.', '2.3.2.15.', true),
  ('CAT000052', 'CAT000032', 'MARKETING', 3, 52, 'despesa', 'despesa', 'Agrupa investimentos em divulgação, aquisição de clientes, comunicação e fortalecimento da marca.', '2.3.3.', true),
  ('CAT000053', 'CAT000052', 'Agência de Marketing', 4, 53, 'despesa', 'despesa', 'Pagamentos a agências, consultores e prestadores de serviços de marketing e publicidade.', '2.3.3.3.', true),
  ('CAT000054', 'CAT000052', 'Google Ads', 4, 54, 'despesa', 'despesa', 'Investimentos em campanhas, anúncios e mídia paga na plataforma Google Ads.', '2.3.3.4.', true),
  ('CAT000055', 'CAT000052', 'Redes Sociais', 4, 55, 'despesa', 'despesa', 'Gastos com divulgação, impulsionamento e serviços em Instagram, TikTok, Facebook e outras redes sociais.', '2.3.3.5.', true),
  ('CAT000056', 'CAT000052', 'Facebook', 4, 56, 'despesa', 'despesa', 'Investimentos específicos em campanhas, impulsionamentos e serviços relacionados ao Facebook.', '2.3.3.11.', true),
  ('CAT000057', 'CAT000052', 'YouTube', 4, 57, 'despesa', 'despesa', 'Gastos com campanhas, anúncios, produção ou divulgação de conteúdo no YouTube.', '2.3.3.14.', true),
  ('CAT000058', 'CAT000052', 'Disparo SMS', 4, 58, 'despesa', 'despesa', 'Pagamentos por plataformas, pacotes e serviços de envio de SMS promocional ou transacional.', '2.3.3.19.', true),
  ('CAT000059', 'CAT000014', 'OUTRAS DESPESAS TRIBUTÁRIAS', 2, 59, 'imposto', 'despesa', 'Tributos, taxas, licenças e obrigações fiscais não diretamente incidentes sobre o faturamento.', '2.4.', true),
  ('CAT000060', 'CAT000014', 'DESPESAS FINANCEIRAS', 2, 60, 'despesa', 'despesa', 'Custos relacionados a bancos, meios de pagamento, juros, multas e serviços financeiros.', '2.5.', true),
  ('CAT000061', 'CAT000060', 'Tarifas Bancárias', 3, 61, 'despesa', 'despesa', 'Tarifas de manutenção, transferências, saques, pacotes bancários e outros serviços cobrados pelos bancos.', '2.5.1.', true),
  ('CAT000062', 'CAT000060', 'Tarifas de Boleto', 3, 62, 'despesa', 'despesa', 'Custos de emissão, registro, baixa ou liquidação de boletos bancários.', '2.5.2.', true),
  ('CAT000063', 'CAT000060', 'Multas e Juros Pagos', 3, 63, 'despesa', 'despesa', 'Pagamentos de juros por atraso, multas contratuais, mora e outros encargos financeiros.', '2.5.3.', true),
  ('CAT000064', 'CAT000060', 'Aluguel Máquina de Cartão', 3, 64, 'despesa', 'despesa', 'Mensalidades, aluguel ou manutenção de terminais e máquinas de cartão.', '2.5.5.', true),
  ('CAT000065', 'CAT000014', 'INVESTIMENTOS (IMOBILIZADO)', 2, 65, 'investimento', 'despesa', 'Aquisições de bens permanentes e melhorias com vida útil prolongada; não incluir manutenção rotineira.', '2.6.', true),
  ('CAT000066', 'CAT000065', 'Móveis e Utensílios', 3, 66, 'investimento', 'despesa', 'Compras de mesas, cadeiras, balcões, armários, utensílios duráveis e mobiliário permanente.', '2.6.1.', true),
  ('CAT000067', 'CAT000065', 'Veículos', 3, 67, 'investimento', 'despesa', 'Compras de carros, motos, vans e outros veículos pertencentes à empresa.', '2.6.2.', true),
  ('CAT000068', 'CAT000065', 'Investimento Usina Solar', 3, 68, 'investimento', 'despesa', 'Aquisição, instalação e implantação de sistemas próprios de geração de energia solar.', '2.6.3.', true)
ON CONFLICT (code) DO UPDATE SET parent_code=EXCLUDED.parent_code, name=EXCLUDED.name, level=EXCLUDED.level, sort_order=EXCLUDED.sort_order, subtype=EXCLUDED.subtype, transaction_type=EXCLUDED.transaction_type, ai_description=EXCLUDED.ai_description, previous_index=EXCLUDED.previous_index, is_customizable=EXCLUDED.is_customizable;

-- 4) RPC de semeadura por empresa
CREATE OR REPLACE FUNCTION public.seed_default_categories(_company_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _tpl record;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _created int := 0;
  _skipped int := 0;
  _map jsonb := '{}'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO _owner FROM public.companies WHERE id = _company_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = '22023';
  END IF;
  IF _owner <> _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR _tpl IN
    SELECT * FROM public.category_templates ORDER BY level ASC, sort_order ASC
  LOOP
    _parent_id := NULL;
    IF _tpl.parent_code IS NOT NULL THEN
      _parent_id := NULLIF(_map->>_tpl.parent_code, '')::uuid;
    END IF;

    SELECT id INTO _existing_id
      FROM public.categories
     WHERE user_id = _owner
       AND company_id = _company_id
       AND template_code = _tpl.code
     LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      _new_id := _existing_id;
      _skipped := _skipped + 1;
    ELSE
      INSERT INTO public.categories (
        user_id, company_id, parent_id, name, transaction_type, context,
        sort_order, is_system, visible_pf,
        template_code, category_subtype, ai_description, previous_index,
        is_customizable, is_active
      ) VALUES (
        _owner, _company_id, _parent_id, _tpl.name, _tpl.transaction_type, 'pj',
        _tpl.sort_order, false, false,
        _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index,
        _tpl.is_customizable, true
      )
      RETURNING id INTO _new_id;
      _created := _created + 1;

      INSERT INTO public.category_companies (category_id, company_id)
      VALUES (_new_id, _company_id)
      ON CONFLICT DO NOTHING;
    END IF;

    _map := _map || jsonb_build_object(_tpl.code, _new_id::text);
  END LOOP;

  RETURN jsonb_build_object('created', _created, 'skipped', _skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_categories(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_default_categories(uuid) TO authenticated;

-- 5) Trigger em companies
CREATE OR REPLACE FUNCTION public.seed_default_categories_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tpl record;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _map jsonb := '{}'::jsonb;
BEGIN
  BEGIN
    FOR _tpl IN
      SELECT * FROM public.category_templates ORDER BY level ASC, sort_order ASC
    LOOP
      _parent_id := NULL;
      IF _tpl.parent_code IS NOT NULL THEN
        _parent_id := NULLIF(_map->>_tpl.parent_code, '')::uuid;
      END IF;

      SELECT id INTO _existing_id FROM public.categories
       WHERE user_id = NEW.user_id AND company_id = NEW.id AND template_code = _tpl.code
       LIMIT 1;

      IF _existing_id IS NOT NULL THEN
        _new_id := _existing_id;
      ELSE
        INSERT INTO public.categories (
          user_id, company_id, parent_id, name, transaction_type, context,
          sort_order, is_system, visible_pf,
          template_code, category_subtype, ai_description, previous_index,
          is_customizable, is_active
        ) VALUES (
          NEW.user_id, NEW.id, _parent_id, _tpl.name, _tpl.transaction_type, 'pj',
          _tpl.sort_order, false, false,
          _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index,
          _tpl.is_customizable, true
        )
        RETURNING id INTO _new_id;

        INSERT INTO public.category_companies (category_id, company_id)
        VALUES (_new_id, NEW.id)
        ON CONFLICT DO NOTHING;
      END IF;

      _map := _map || jsonb_build_object(_tpl.code, _new_id::text);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_default_categories_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_seed_default_categories ON public.companies;
CREATE TRIGGER companies_seed_default_categories
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories_on_company();