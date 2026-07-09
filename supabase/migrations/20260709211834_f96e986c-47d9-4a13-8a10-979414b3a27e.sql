
-- Seed function: inserts the default chart of accounts template for a company.
-- Idempotent: only inserts accounts whose (context, code candidate) does not already exist for the user linked to that company.
-- Uses the existing chart_account_autofill_code trigger to generate codes automatically.

CREATE OR REPLACE FUNCTION public.chart_accounts_seed_default(_user_id uuid, _company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nodes jsonb := $json$[
    {"k":"1","p":null,"n":"ATIVO","s":true,"t":false,"d":"Bens, direitos e recursos econômicos pertencentes à empresa ou que ela tenha direito de receber. Inclui dinheiro, saldos bancários, aplicações, valores a receber, estoques e bens duráveis."},
    {"k":"1.1","p":"1","n":"ATIVO CIRCULANTE","s":true,"t":false,"d":"Dinheiro, aplicações de curto prazo, valores a receber, estoques e outros bens ou direitos convertíveis em dinheiro no curto prazo."},
    {"k":"1.1.1","p":"1.1","n":"Caixa","s":false,"t":false,"d":"Movimentações de dinheiro físico mantido pela empresa. Não utilizar para PIX, cartão, boleto ou transferência bancária."},
    {"k":"1.1.2","p":"1.1","n":"Bancos Conta Corrente","s":false,"t":false,"d":"Saldos e movimentações das contas bancárias da empresa: depósitos, transferências, PIX, débitos automáticos e tarifas."},
    {"k":"1.1.3","p":"1.1","n":"Aplicações Financeiras de Curto Prazo","s":false,"t":false,"d":"Aplicações com liquidez ou resgate no curto prazo: CDB, fundos, Tesouro Direto. Rendimentos vão em Receita Financeira."},
    {"k":"1.1.4","p":"1.1","n":"Clientes a Receber","s":false,"t":false,"d":"Valores a receber de clientes por vendas ou serviços a prazo: duplicatas, boletos, mensalidades, parcelas pendentes."},
    {"k":"1.1.5","p":"1.1","n":"Cartões a Receber","s":false,"t":false,"d":"Vendas em cartão de crédito/débito a serem repassadas pela adquirente (Cielo, Stone, Rede, PagSeguro, Mercado Pago, etc.)."},
    {"k":"1.1.6","p":"1.1","n":"Empréstimos Concedidos","s":false,"t":false,"d":"Valores emprestados pela empresa a sócios, funcionários ou terceiros com direito de recebimento futuro."},
    {"k":"1.1.7","p":"1.1","n":"Adiantamentos","s":false,"t":false,"d":"Valores pagos antecipadamente: adiantamento a fornecedor, viagem, salarial e serviços não realizados."},
    {"k":"1.1.8","p":"1.1","n":"Estoques","s":false,"t":false,"d":"Mercadorias para revenda, matéria-prima, produtos em elaboração e acabados."},
    {"k":"1.2","p":"1","n":"ATIVO NÃO CIRCULANTE","s":true,"t":false,"d":"Bens e direitos utilizados ou mantidos por prazo mais longo."},
    {"k":"1.2.1","p":"1.2","n":"Investimentos de Longo Prazo","s":false,"t":false,"d":"Participações societárias e aplicações financeiras de longo prazo."},
    {"k":"1.2.2","p":"1.2","n":"Veículos","s":false,"t":false,"d":"Aquisição de carros, motos, caminhões, vans e outros veículos da empresa. Não usar para combustível, manutenção ou seguro."},
    {"k":"1.2.3","p":"1.2","n":"Máquinas e Equipamentos","s":false,"t":false,"d":"Aquisição de máquinas, equipamentos produtivos e industriais duráveis."},
    {"k":"1.2.4","p":"1.2","n":"Equipamentos de Informática","s":false,"t":false,"d":"Computadores, notebooks, servidores, monitores, impressoras. Não usar para SaaS ou mensalidades de software."},
    {"k":"1.2.5","p":"1.2","n":"Móveis e Utensílios","s":false,"t":false,"d":"Mesas, cadeiras, armários, estantes e demais móveis de uso duradouro."},
    {"k":"1.2.6","p":"1.2","n":"Imóveis","s":false,"t":false,"d":"Terrenos, salas comerciais, lojas, galpões e escritórios pertencentes à empresa. Não usar para aluguel de terceiros."},
    {"k":"1.2.7","p":"1.2","n":"Softwares e Intangíveis","s":false,"t":false,"d":"Ativos sem existência física: software adquirido, licença permanente, marcas e patentes. Não usar para assinaturas SaaS."},

    {"k":"2","p":null,"n":"PASSIVO","s":true,"t":false,"d":"Obrigações financeiras e compromissos que a empresa deverá pagar a terceiros: fornecedores, empréstimos, tributos, salários e encargos."},
    {"k":"2.1","p":"2","n":"PASSIVO CIRCULANTE","s":true,"t":false,"d":"Obrigações a pagar no curto prazo."},
    {"k":"2.1.1","p":"2.1","n":"Fornecedores a Pagar","s":false,"t":false,"d":"Valores devidos a fornecedores por compras a prazo: boletos, duplicatas, faturas."},
    {"k":"2.1.2","p":"2.1","n":"Empréstimos e Financiamentos de Curto Prazo","s":false,"t":false,"d":"Parcelas de empréstimos e financiamentos com pagamento no curto prazo. Separar amortização de juros quando possível."},
    {"k":"2.1.3","p":"2.1","n":"Cartões de Crédito a Pagar","s":false,"t":false,"d":"Faturas de cartão de crédito empresarial ainda não pagas. Pagamento é liquidação, não nova despesa."},
    {"k":"2.1.4","p":"2.1","n":"Salários a Pagar","s":false,"t":false,"d":"Salários e remunerações devidos aos funcionários e ainda não pagos."},
    {"k":"2.1.5","p":"2.1","n":"Encargos Trabalhistas a Recolher","s":false,"t":false,"d":"Obrigações sobre folha: FGTS, INSS e outras."},
    {"k":"2.1.6","p":"2.1","n":"Impostos a Recolher","s":false,"t":false,"d":"Tributos calculados ou retidos a pagar: DAS, ISS, ICMS, PIS, COFINS, IRPJ, CSLL, INSS."},
    {"k":"2.1.7","p":"2.1","n":"Aluguéis a Pagar","s":false,"t":false,"d":"Valores de aluguel devidos e ainda não pagos."},
    {"k":"2.1.8","p":"2.1","n":"Outras Contas a Pagar","s":false,"t":false,"d":"Obrigações sem classificação específica. Usar apenas quando não houver classificação melhor."},
    {"k":"2.2","p":"2","n":"PASSIVO NÃO CIRCULANTE","s":true,"t":false,"d":"Obrigações a pagar no longo prazo."},
    {"k":"2.2.1","p":"2.2","n":"Empréstimos de Longo Prazo","s":false,"t":false,"d":"Empréstimos com vencimento de longo prazo."},
    {"k":"2.2.2","p":"2.2","n":"Financiamentos de Longo Prazo","s":false,"t":false,"d":"Financiamentos de veículos, máquinas, imóveis com pagamento de longo prazo."},
    {"k":"2.2.3","p":"2.2","n":"Parcelamentos Tributários","s":false,"t":false,"d":"Parcelamentos de impostos e dívidas tributárias de longo prazo."},

    {"k":"3","p":null,"n":"PATRIMÔNIO LÍQUIDO","s":true,"t":false,"d":"Recursos próprios da empresa: capital dos sócios e resultados acumulados. Não classificar vendas ou empréstimos aqui."},
    {"k":"3.1","p":"3","n":"Capital Social","s":false,"t":false,"d":"Valores formalmente investidos pelos sócios na constituição ou aumento do capital."},
    {"k":"3.2","p":"3","n":"Aportes dos Sócios","s":false,"t":false,"d":"Entradas de recursos dos sócios para financiar a operação, quando caracterizadas como aporte."},
    {"k":"3.3","p":"3","n":"Lucros Acumulados","s":false,"t":false,"d":"Resultados positivos acumulados e ainda não distribuídos."},
    {"k":"3.4","p":"3","n":"Prejuízos Acumulados","s":false,"t":false,"d":"Resultados negativos acumulados pela empresa."},
    {"k":"3.5","p":"3","n":"Distribuição de Lucros","s":false,"t":false,"d":"Valores distribuídos aos sócios a título de lucro. Não é despesa operacional."},

    {"k":"4","p":null,"n":"RECEITAS","s":true,"t":false,"d":"Valores gerados pelas atividades da empresa e outros ganhos: vendas, serviços, mensalidades, comissões, receitas financeiras."},
    {"k":"4.1","p":"4","n":"Receita de Venda de Produtos","s":false,"t":false,"d":"Vendas de mercadorias/produtos: varejo, atacado, e-commerce."},
    {"k":"4.2","p":"4","n":"Receita de Prestação de Serviços","s":false,"t":false,"d":"Serviços prestados a clientes: consultoria, honorários, projeto, manutenção, instalação, treinamento."},
    {"k":"4.3","p":"4","n":"Receita de Assinaturas e Mensalidades","s":false,"t":false,"d":"Receitas recorrentes de planos, assinaturas e licenças de uso."},
    {"k":"4.4","p":"4","n":"Receita de Comissões","s":false,"t":false,"d":"Comissões, intermediações, indicações e representação comercial recebidas."},
    {"k":"4.5","p":"4","n":"Receitas Financeiras","s":false,"t":false,"d":"Ganhos financeiros: rendimentos de aplicação, juros recebidos, descontos obtidos."},
    {"k":"4.6","p":"4","n":"Outras Receitas","s":false,"t":false,"d":"Receitas eventuais ou não operacionais sem classificação específica."},

    {"k":"5","p":null,"n":"CUSTOS","s":true,"t":false,"d":"Gastos diretamente relacionados à produção, aquisição ou execução do que a empresa vende ao cliente."},
    {"k":"5.1","p":"5","n":"Custo das Mercadorias Vendidas","s":false,"t":false,"d":"Custo de aquisição das mercadorias efetivamente vendidas."},
    {"k":"5.2","p":"5","n":"Custo dos Produtos Vendidos","s":false,"t":false,"d":"Materiais, insumos e custos diretos de fabricação dos produtos vendidos."},
    {"k":"5.3","p":"5","n":"Custo dos Serviços Prestados","s":false,"t":false,"d":"Mão de obra e materiais diretamente vinculados à execução dos serviços vendidos."},
    {"k":"5.4","p":"5","n":"Matéria-Prima e Insumos","s":false,"t":false,"d":"Materiais consumidos diretamente no processo de produção."},
    {"k":"5.5","p":"5","n":"Terceirização Operacional","s":false,"t":false,"d":"Serviços terceirizados diretamente vinculados à produção ou entrega do serviço principal."},

    {"k":"6","p":null,"n":"DESPESAS OPERACIONAIS","s":true,"t":false,"d":"Gastos para administrar, vender, divulgar e manter a empresa, sem relação direta com a produção."},
    {"k":"6.1","p":"6","n":"Despesas Administrativas","s":true,"t":false,"d":"Gastos administrativos e de estrutura da empresa."},
    {"k":"6.1.1","p":"6.1","n":"Aluguel","s":false,"t":false,"d":"Aluguel de escritório, loja, galpão ou outros imóveis usados pela empresa."},
    {"k":"6.1.2","p":"6.1","n":"Condomínio","s":false,"t":false,"d":"Taxas condominiais dos imóveis utilizados pela empresa."},
    {"k":"6.1.3","p":"6.1","n":"Energia Elétrica","s":false,"t":false,"d":"Contas de energia elétrica (luz, concessionária)."},
    {"k":"6.1.4","p":"6.1","n":"Água e Saneamento","s":false,"t":false,"d":"Contas de água, esgoto e saneamento."},
    {"k":"6.1.5","p":"6.1","n":"Internet e Telefonia","s":false,"t":false,"d":"Internet, telefonia fixa e móvel, planos corporativos."},
    {"k":"6.1.6","p":"6.1","n":"Softwares e Sistemas","s":false,"t":false,"d":"Assinaturas SaaS, sistemas de gestão, CRM, ERP, IA, armazenamento em nuvem."},
    {"k":"6.1.7","p":"6.1","n":"Material de Escritório","s":false,"t":false,"d":"Papelaria, materiais de expediente, impressão."},
    {"k":"6.1.8","p":"6.1","n":"Serviços Contábeis","s":false,"t":false,"d":"Honorários de contabilidade e serviços contábeis."},
    {"k":"6.1.9","p":"6.1","n":"Serviços Jurídicos","s":false,"t":false,"d":"Honorários advocatícios e assessoria jurídica."},
    {"k":"6.1.10","p":"6.1","n":"Consultorias","s":false,"t":false,"d":"Consultorias empresariais, estratégicas, financeiras e comerciais."},
    {"k":"6.2","p":"6","n":"Despesas Comerciais e Marketing","s":true,"t":false,"d":"Gastos de vendas, marketing e relacionamento com clientes."},
    {"k":"6.2.1","p":"6.2","n":"Publicidade e Propaganda","s":false,"t":false,"d":"Campanhas publicitárias, material promocional, mídia e agências."},
    {"k":"6.2.2","p":"6.2","n":"Tráfego Pago","s":false,"t":false,"d":"Anúncios digitais: Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads."},
    {"k":"6.2.3","p":"6.2","n":"Comissões de Vendas","s":false,"t":false,"d":"Comissões pagas a vendedores, representantes, parceiros e afiliados."},
    {"k":"6.2.4","p":"6.2","n":"Ferramentas Comerciais","s":false,"t":false,"d":"CRM, automação comercial, prospecção e plataformas de vendas."},
    {"k":"6.2.5","p":"6.2","n":"Eventos e Feiras","s":false,"t":false,"d":"Participação, patrocínio e montagem em eventos comerciais."},
    {"k":"6.3","p":"6","n":"Despesas com Pessoal","s":true,"t":false,"d":"Gastos com equipe própria e sócios."},
    {"k":"6.3.1","p":"6.3","n":"Salários","s":false,"t":false,"d":"Remuneração dos funcionários."},
    {"k":"6.3.2","p":"6.3","n":"Pró-Labore","s":false,"t":false,"d":"Remuneração dos sócios pelo trabalho. Não confundir com distribuição de lucros."},
    {"k":"6.3.3","p":"6.3","n":"FGTS","s":false,"t":false,"d":"Despesas com FGTS dos funcionários."},
    {"k":"6.3.4","p":"6.3","n":"INSS Patronal e Encargos","s":false,"t":false,"d":"Encargos sociais e previdenciários suportados pela empresa."},
    {"k":"6.3.5","p":"6.3","n":"Benefícios","s":false,"t":false,"d":"Vale-transporte, refeição, alimentação, plano de saúde e outros benefícios."},
    {"k":"6.3.6","p":"6.3","n":"Treinamentos","s":false,"t":false,"d":"Cursos, capacitações e desenvolvimento profissional da equipe."},
    {"k":"6.4","p":"6","n":"Despesas com Veículos e Deslocamento","s":true,"t":false,"d":"Gastos operacionais com veículos e deslocamentos profissionais."},
    {"k":"6.4.1","p":"6.4","n":"Combustível","s":false,"t":false,"d":"Abastecimento de veículos usados nas atividades."},
    {"k":"6.4.2","p":"6.4","n":"Manutenção de Veículos","s":false,"t":false,"d":"Oficina, revisão, óleo, pneus, peças e serviços."},
    {"k":"6.4.3","p":"6.4","n":"Estacionamento e Pedágio","s":false,"t":false,"d":"Estacionamento, pedágio e tarifas rodoviárias."},
    {"k":"6.4.4","p":"6.4","n":"Aplicativos de Transporte","s":false,"t":false,"d":"Corridas e deslocamentos por aplicativos de transporte."},
    {"k":"6.4.5","p":"6.4","n":"Viagens e Hospedagem","s":false,"t":false,"d":"Passagens, hotéis, hospedagens e despesas de viagem profissional."},

    {"k":"7","p":null,"n":"DESPESAS FINANCEIRAS","s":true,"t":false,"d":"Gastos com serviços financeiros, crédito, empréstimos e movimentações bancárias."},
    {"k":"7.1","p":"7","n":"Tarifas Bancárias","s":false,"t":false,"d":"Tarifas de manutenção, transferência e pacotes bancários."},
    {"k":"7.2","p":"7","n":"Juros de Empréstimos","s":false,"t":false,"d":"Parcela de juros de empréstimos. Amortização do principal não é despesa."},
    {"k":"7.3","p":"7","n":"Juros e Multas por Atraso","s":false,"t":false,"d":"Juros de mora, multas e encargos por pagamentos em atraso."},
    {"k":"7.4","p":"7","n":"Taxas de Cartão e Adquirência","s":false,"t":false,"d":"MDR, processamento, antecipação e outras tarifas das adquirentes."},
    {"k":"7.5","p":"7","n":"IOF","s":false,"t":true,"d":"Imposto sobre Operações Financeiras."},

    {"k":"8","p":null,"n":"IMPOSTOS E TRIBUTOS","s":true,"t":false,"d":"Despesas tributárias relacionadas às atividades da empresa."},
    {"k":"8.1","p":"8","n":"Simples Nacional","s":false,"t":true,"d":"Despesas do DAS do Simples Nacional."},
    {"k":"8.2","p":"8","n":"ISS","s":false,"t":true,"d":"Imposto Sobre Serviços."},
    {"k":"8.3","p":"8","n":"ICMS","s":false,"t":true,"d":"Imposto sobre Circulação de Mercadorias e Serviços."},
    {"k":"8.4","p":"8","n":"PIS e COFINS","s":false,"t":true,"d":"Contribuições sobre o faturamento."},
    {"k":"8.5","p":"8","n":"IRPJ e CSLL","s":false,"t":true,"d":"Impostos incidentes sobre o lucro."},
    {"k":"8.6","p":"8","n":"Taxas e Licenças","s":false,"t":true,"d":"Alvarás, licenças de funcionamento, taxas municipais, estaduais e federais."},

    {"k":"9","p":null,"n":"CONTAS DE CONTROLE E EXCEÇÃO","s":true,"t":false,"d":"Contas auxiliares para movimentações internas e classificações pendentes."},
    {"k":"9.1","p":"9","n":"Transferências entre Contas Próprias","s":false,"t":false,"d":"Movimentação entre contas, carteiras ou caixas da própria empresa. Não afeta a DRE."},
    {"k":"9.2","p":"9","n":"Aporte de Sócio a Classificar","s":false,"t":false,"d":"Entrada de recursos de sócio pendente de classificação (aporte, empréstimo, etc.)."},
    {"k":"9.3","p":"9","n":"Retirada de Sócio a Classificar","s":false,"t":false,"d":"Saída para sócio pendente de classificação (pró-labore, lucro, reembolso)."},
    {"k":"9.4","p":"9","n":"Transação Pendente de Classificação","s":false,"t":false,"d":"Fila de aprendizado para transações sem classificação segura. Reclassificar manualmente."}
  ]$json$::jsonb;
  _ids jsonb := '{}'::jsonb;
  _node jsonb;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _inserted int := 0;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN
    RAISE EXCEPTION 'user_id and company_id are required' USING ERRCODE = '22023';
  END IF;

  FOR _node IN SELECT * FROM jsonb_array_elements(_nodes)
  LOOP
    _parent_id := NULL;
    IF _node->>'p' IS NOT NULL THEN
      _parent_id := NULLIF(_ids->>(_node->>'p'), '')::uuid;
      -- If parent wasn't inserted (already existed with different name), skip child insertion to avoid mismatch
    END IF;

    -- Check if an account with same name+parent already exists (idempotence & merge)
    SELECT id INTO _existing_id
    FROM public.chart_accounts
    WHERE user_id = _user_id
      AND context = 'pj'
      AND name = _node->>'n'
      AND parent_id IS NOT DISTINCT FROM _parent_id
    LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      _new_id := _existing_id;
    ELSE
      INSERT INTO public.chart_accounts (
        user_id, context, name, description, parent_id,
        allow_transactions, is_active, is_tax, visible_pf
      ) VALUES (
        _user_id, 'pj', _node->>'n', _node->>'d', _parent_id,
        NOT (_node->>'s')::boolean, true, (_node->>'t')::boolean, false
      )
      RETURNING id INTO _new_id;
      _inserted := _inserted + 1;
    END IF;

    _ids := _ids || jsonb_build_object(_node->>'k', _new_id::text);

    -- Link to company (ignore if already linked)
    INSERT INTO public.chart_account_companies (chart_account_id, company_id)
    VALUES (_new_id, _company_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.chart_accounts_seed_default(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_seed_default(uuid, uuid) TO authenticated, service_role;

-- Trigger function: seeds when a new company is created
CREATE OR REPLACE FUNCTION public.chart_accounts_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.chart_accounts_seed_default(NEW.user_id, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Never block company creation on seed errors
    RAISE WARNING 'chart_accounts_seed_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chart_accounts_seed_on_company ON public.companies;
CREATE TRIGGER trg_chart_accounts_seed_on_company
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.chart_accounts_seed_on_company();

-- Wrapper RPC for the frontend "Restaurar Modelo Padrão" button.
-- Verifies caller is the owner of the company before seeding.
CREATE OR REPLACE FUNCTION public.chart_accounts_restore_default(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
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
  RETURN public.chart_accounts_seed_default(_owner, _company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.chart_accounts_restore_default(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_restore_default(uuid) TO authenticated, service_role;
