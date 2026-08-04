-- 1) Novos metadados
ALTER TABLE public.category_templates
  ADD COLUMN IF NOT EXISTS allow_transactions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temporary_category boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_behavior text,
  ADD COLUMN IF NOT EXISTS ai_excluded_keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS template_version text NOT NULL DEFAULT 'v3';

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS allow_transactions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temporary_category boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_behavior text,
  ADD COLUMN IF NOT EXISTS ai_excluded_keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS template_version text;

-- 2) Substituição do modelo padrão
DELETE FROM public.category_templates;

INSERT INTO public.category_templates
 (code,parent_code,name,level,sort_order,subtype,transaction_type,chart_account_code,
  guidance_include,guidance_exclude,examples,keywords,ai_excluded_keywords,
  allow_transactions,requires_review,temporary_category,accounting_behavior,
  in_dre,is_contribution_margin,is_cmv,is_patrimonial,is_customizable,template_version)
VALUES
('1',NULL,'Entradas',1,100,'receita','entrada',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('1.1','1','Receitas Operacionais',2,110,'receita','entrada',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,true,false,false,false,'v3'),
('1.1.1','1.1','Vendas no Salão e Balcão',3,111,'receita','entrada','4.1.1',
 'Vendas realizadas presencialmente no salão, balcão, caixa ou retirada direta no estabelecimento.',
 'iFood e marketplaces, delivery próprio, eventos, empréstimos, aportes dos sócios.',
 'Consumo no salão; venda no balcão; retirada no restaurante; venda para viagem presencial.',
 '{salao,balcao,caixa,pdv,mesa,comanda,retirada,presencial}','{ifood,rappi,delivery,marketplace,aporte,emprestimo}',true,false,false,'revenue',true,true,false,false,true,'v3'),
('1.1.2','1.1','Delivery Próprio',3,112,'receita','entrada','4.1.3',
 'Vendas realizadas por canal próprio da empresa com entrega ao cliente.',
 'Pedidos por marketplace, taxas de entrega, comissão de aplicativo, venda retirada no balcão.',
 'Pedidos por WhatsApp; site próprio; aplicativo próprio; telefone com entrega.',
 '{delivery,whatsapp,"site proprio","app proprio",telefone,entrega}','{ifood,rappi,marketplace,comissao,frete}',true,false,false,'revenue',true,true,false,false,true,'v3'),
('1.1.3','1.1','Marketplaces e Aplicativos',3,113,'receita','entrada','4.1.4',
 'Valor bruto das vendas realizadas por plataformas de delivery e marketplaces. Registre a receita pelo bruto; comissões e taxas vão em categorias próprias.',
 'Valor líquido do repasse, comissão do marketplace, frete da plataforma, antecipação de repasse.',
 'Vendas iFood; Rappi; marketplace local; plataforma terceirizada.',
 '{ifood,rappi,ubereats,marketplace,aplicativo,plataforma,"99food"}','{comissao,repasse,liquido,antecipacao,frete}',true,false,false,'revenue',true,true,false,false,true,'v3'),
('1.1.4','1.1','Eventos, Encomendas e Serviços',3,114,'receita','entrada','4.1.5',
 'Receitas de eventos, catering, encomendas especiais e serviços de alimentação contratados.',
 'Venda normal no salão, delivery recorrente, aluguel de espaço sem serviço de alimentação.',
 'Buffet; coffee break; festa; encomenda de bolo; jantar corporativo.',
 '{evento,buffet,catering,"coffee break",encomenda,festa,corporativo}','{salao,delivery,aluguel}',true,false,false,'revenue',true,true,false,false,true,'v3'),
('1.1.5','1.1','Outras Vendas Operacionais',3,115,'receita','entrada','4.1.9',
 'Vendas relacionadas à atividade principal que não se enquadram nas categorias anteriores.',
 'Venda de equipamentos, aporte, empréstimo, rendimento bancário.',
 'Venda de produtos próprios; revenda; atacado; clube gastronômico.',
 '{revenda,atacado,assinatura,clube,"produto proprio"}','{aporte,emprestimo,rendimento,equipamento}',true,false,false,'revenue',true,true,false,false,true,'v3'),
('1.2','1','Outras Entradas',2,130,'receita','entrada',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('1.2.1','1.2','Receitas Financeiras',3,131,'receita','entrada','4.3.5',
 'Ganhos originados de aplicações, juros e operações financeiras.',
 'Desconto comercial em compra de estoque, venda de produtos, antecipação de recebíveis.',
 'Rendimento de aplicação; juros recebidos; multa recebida de cliente; desconto financeiro obtido.',
 '{rendimento,aplicacao,juros,"multa recebida","desconto financeiro"}','{venda,antecipacao,estoque}',true,false,false,'financial_revenue',true,false,false,false,true,'v3'),
('1.2.2','1.2','Reembolsos de Despesas',3,132,'receita','entrada','4.4.2',
 'Recuperação de valor que a empresa pagou por conta de terceiro. Sempre que possível, relacione ao lançamento original.',
 'Venda, indenização, aporte, devolução de compra de estoque sem análise da despesa original.',
 'Reembolso de despesa por funcionário; reembolso de empresa relacionada; restituição de despesa paga indevidamente.',
 '{reembolso,restituicao,ressarcimento,devolucao}','{venda,aporte,indenizacao}',true,true,false,'expense_reimbursement',true,false,false,false,true,'v3'),
('1.2.3','1.2','Indenizações, Recuperações e Outras Entradas',3,133,'receita','entrada','4.4.5',
 'Valores eventuais que não representam vendas da atividade principal.',
 'Vendas, empréstimos, aportes, reembolsos de despesas identificáveis.',
 'Indenização de seguro; recuperação judicial; ressarcimento por dano; recuperação de perda.',
 '{indenizacao,seguro,judicial,recuperacao,ressarcimento}','{venda,aporte,emprestimo}',true,true,false,'other_income',true,false,false,false,true,'v3'),
('1.2.4','1.2','Venda de Ativos',3,134,'patrimonial','entrada','1.2.2.12',
 'Recebimentos provenientes da venda de bens utilizados pela empresa. Exige revisão: pode gerar baixa do ativo, da depreciação e ganho ou perda contábil.',
 'Venda de mercadorias, venda de alimentos, venda de equipamentos adquiridos para revenda.',
 'Venda de veículo; forno; geladeira; móveis; computador.',
 '{"venda de ativo","venda de equipamento",veiculo,imobilizado,"venda de bem"}','{mercadoria,alimento,revenda}',true,true,false,'asset_disposal',false,false,false,true,true,'v3'),
('1.3','1','Entradas Patrimoniais',2,150,'patrimonial','entrada',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,false,false,false,true,false,'v3'),
('1.3.1','1.3','Aportes de Capital',3,151,'patrimonial','entrada','3.1.1',
 'Valores investidos definitivamente pelos sócios na empresa.',
 'Empréstimo temporário do sócio, venda, reembolso, transferência entre contas.',
 'Integralização de capital; aumento de capital; aporte definitivo; AFAC.',
 '{aporte,capital,integralizacao,afac,socio}','{emprestimo,venda,transferencia}',true,true,false,'capital_contribution',false,false,false,true,true,'v3'),
('1.3.2','1.3','Empréstimos e Adiantamentos de Sócios',3,152,'patrimonial','entrada','2.1.7.3',
 'Valores disponibilizados temporariamente pelos sócios e que poderão ser devolvidos.',
 'Capital social definitivo, distribuição de lucro, receita operacional.',
 'Empréstimo do sócio; valor pago pelo sócio para cobrir o caixa; adiantamento temporário.',
 '{"emprestimo socio","adiantamento socio",mutuo}','{capital,lucro,receita}',true,true,false,'partner_loan_receipt',false,false,false,true,true,'v3'),
('1.3.3','1.3','Empréstimos e Financiamentos Recebidos',3,153,'patrimonial','entrada','2.1.4.5',
 'Recursos recebidos de bancos ou instituições financeiras.',
 'Receita, aporte de sócio, antecipação de cartão já registrada como recebível.',
 'Capital de giro; financiamento de equipamento; empréstimo bancário; linha de crédito.',
 '{emprestimo,financiamento,"capital de giro","linha de credito"}','{receita,aporte,antecipacao}',true,true,false,'loan_receipt',false,false,false,true,true,'v3'),
('1.3.4','1.3','Adiantamentos de Clientes e Empresas Relacionadas',3,154,'patrimonial','entrada','2.1.5.1',
 'Valores recebidos antes da entrega do produto ou recebidos temporariamente de outra empresa relacionada.',
 'Venda já realizada, transferência entre contas da mesma empresa, aporte definitivo.',
 'Sinal de evento; pagamento antecipado de cliente; crédito temporário entre unidades.',
 '{sinal,adiantamento,antecipado,"empresa relacionada"}','{venda,transferencia,aporte}',true,true,false,'customer_advance',false,false,false,true,true,'v3'),
('2',NULL,'Saídas',1,200,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.1','2','Impostos, Taxas e Licenças',2,210,'imposto','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.1.1','2.1','Tributos sobre Faturamento',3,211,'imposto','saida','8.1.1',
 'Impostos relacionados às vendas e ao faturamento.',
 'IPTU, IPVA, encargos da folha, multas fiscais.',
 'Simples Nacional; ICMS; ISS; PIS; COFINS.',
 '{das,simples,icms,iss,pis,cofins,imposto}','{iptu,ipva,fgts,inss,multa}',true,false,false,'tax_payment',true,false,false,false,true,'v3'),
('2.1.2','2.1','Taxas, Alvarás e Licenças',3,212,'imposto','saida','8.3.3',
 'Taxas obrigatórias para funcionamento e regularização da empresa.',
 'Mensalidade de sistema, consultoria, multa fiscal.',
 'Alvará; licença sanitária; taxa dos bombeiros; licença ambiental.',
 '{alvara,licenca,vigilancia,bombeiro,ambiental,taxa}','{sistema,consultoria,multa}',true,false,false,'tax_payment',true,false,false,false,true,'v3'),
('2.1.3','2.1','Multas e Encargos Tributários',3,213,'imposto','saida','8.4.1',
 'Multas e juros decorrentes de atraso ou infração tributária.',
 'Juros bancários, multa de fornecedor, tributo principal.',
 'Multa de imposto; juros sobre tributo; encargos de parcelamento tributário.',
 '{"multa fiscal","juros sobre tributo",parcelamento,penalidade}','{"juros bancarios",fornecedor}',true,false,false,'tax_payment',true,false,false,false,true,'v3'),
('2.2','2','Custos e CMV',2,220,'custo','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,true,true,false,false,'v3'),
('2.2.1','2.2','Alimentos',3,221,'custo','saida','5.1.11',
 'Compra de ingredientes e insumos utilizados na produção dos alimentos vendidos.',
 'Bebidas, embalagens, produtos de limpeza, equipamentos, refeições particulares.',
 'Carnes; aves; peixes; hortifrúti; laticínios; farinha; temperos; congelados.',
 '{carne,frango,peixe,hortifruti,laticinio,farinha,tempero,congelado,acougue,mercearia}','{bebida,cerveja,embalagem,limpeza,equipamento}',true,false,false,'inventory_purchase',true,true,true,false,true,'v3'),
('2.2.2','2.2','Bebidas',3,222,'custo','saida','5.2.7',
 'Compra de bebidas para venda ou utilização na preparação dos produtos vendidos.',
 'Bebidas para consumo particular, material de limpeza, copos e embalagens, equipamentos.',
 'Cerveja; chope; vinho; destilados; refrigerante; água; suco; café.',
 '{cerveja,chope,vinho,destilado,refrigerante,agua,suco,cafe,distribuidora}','{copo,embalagem,limpeza,equipamento}',true,false,false,'inventory_purchase',true,true,true,false,true,'v3'),
('2.2.3','2.2','Embalagens e Materiais Diretos',3,223,'custo','saida','5.3.5',
 'Materiais consumidos na entrega, acondicionamento ou serviço dos produtos vendidos.',
 'Pratos de porcelana, talheres de inox, panelas, produtos de limpeza, material administrativo.',
 'Caixas de pizza; marmitas; copos descartáveis; sacolas; lacres; etiquetas.',
 '{embalagem,marmita,"caixa de pizza",descartavel,sacola,lacre,etiqueta}','{porcelana,inox,panela,limpeza}',true,false,false,'inventory_purchase',true,true,true,false,true,'v3'),
('2.2.4','2.2','Perdas, Quebras e Desperdícios',3,224,'custo','saida','5.6.8',
 'Perdas identificadas de estoque, produção ou operação.',
 'Consumo normal do estoque, compras, promoções registradas como desconto ou marketing.',
 'Produtos vencidos; desperdício de produção; quebra; diferença de inventário; cortesia; furto.',
 '{perda,quebra,desperdicio,vencido,inventario,cortesia,furto,avaria}','{compra,promocao,marketing}',true,false,false,'cost_purchase',true,true,true,false,true,'v3'),
('2.3','2','Pessoal',2,230,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.3.1','2.3','Pessoal Operacional',3,231,'custo','saida','5.4.1',
 'Salários e pagamentos da equipe diretamente envolvida na operação.',
 'Gerente administrativo, contador, sócio, freelancer terceirizado.',
 'Cozinheiros; auxiliares de cozinha; garçons; atendentes; caixas; bartenders; entregadores próprios.',
 '{salario,cozinheiro,garcom,atendente,bartender,entregador,"folha operacional"}','{"pro-labore",contador,freelancer,administrativo}',true,false,false,'labor_cost',true,false,false,false,true,'v3'),
('2.3.2','2.3','Freelancers e Serviços Operacionais Temporários',3,232,'custo','saida','5.5.1',
 'Profissionais temporários ou terceirizados diretamente ligados à operação.',
 'Funcionário registrado, consultor, contador, agência de marketing.',
 'Garçom freelancer; cozinheiro temporário; motoboy terceirizado; equipe de evento; diária.',
 '{freelancer,freela,diaria,temporario,motoboy,terceirizado}','{clt,consultor,contador,marketing}',true,false,false,'labor_cost',true,false,false,false,true,'v3'),
('2.3.3','2.3','Pessoal Administrativo e Gestão',3,233,'despesa','saida','6.4.1',
 'Salários e pagamentos de profissionais administrativos e gerenciais.',
 'Cozinheiro, garçom, entregador operacional, pró-labore.',
 'Gerente administrativo; financeiro; auxiliar administrativo; RH.',
 '{"salario administrativo",gerente,financeiro,rh,"auxiliar administrativo"}','{cozinheiro,garcom,"pro-labore"}',true,false,false,'labor_cost',true,false,false,false,true,'v3'),
('2.3.4','2.3','Encargos e Benefícios',3,234,'despesa','saida','6.4.3',
 'Encargos, benefícios e obrigações relacionados aos trabalhadores.',
 'Salário, pró-labore, tributo sobre faturamento.',
 'INSS; FGTS; férias; 13º; vale-transporte; vale-alimentação; plano de saúde; rescisões.',
 '{inss,fgts,ferias,"decimo terceiro","vale transporte","vale alimentacao","plano de saude",rescisao}','{salario,"pro-labore",das}',true,false,false,'labor_cost',true,false,false,false,true,'v3'),
('2.3.5','2.3','Pró-Labore',3,235,'despesa','saida','6.4.2',
 'Remuneração formal dos sócios pelo trabalho realizado na empresa.',
 'Distribuição de lucros, reembolso de despesas, empréstimo ao sócio, retirada informal.',
 'Pró-labore mensal; encargos vinculados ao pró-labore.',
 '{"pro-labore",prolabore,"remuneracao socio"}','{lucro,reembolso,emprestimo}',true,false,false,'labor_cost',true,false,false,false,true,'v3'),
('2.4','2','Despesas Variáveis de Venda',2,240,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,true,false,false,false,'v3'),
('2.4.1','2.4','Comissões de Marketplaces',3,241,'despesa','saida','6.2.1',
 'Comissões cobradas por aplicativos e plataformas sobre as vendas.',
 'Receita da venda, frete, antecipação de repasse, publicidade patrocinada no aplicativo.',
 'Comissão iFood; comissão Rappi; comissão percentual sobre pedidos.',
 '{"comissao ifood","comissao rappi",comissao,marketplace,plataforma}','{receita,frete,antecipacao,patrocinado}',true,false,false,'variable_sales_expense',true,true,false,false,true,'v3'),
('2.4.2','2.4','Taxas de Cartões e Meios de Pagamento',3,242,'despesa','saida','6.2.8',
 'Taxas cobradas pelo processamento das vendas.',
 'Antecipação de recebíveis, tarifa bancária, valor líquido recebido da venda.',
 'MDR; taxa de débito; taxa de crédito; taxa de vale-refeição; gateway; aluguel de maquininha.',
 '{mdr,"taxa de cartao",adquirente,gateway,maquininha,stone,cielo,getnet,pagseguro}','{antecipacao,"tarifa bancaria"}',true,false,false,'variable_sales_expense',true,true,false,false,true,'v3'),
('2.4.3','2.4','Fretes e Entregas',3,243,'despesa','saida','6.2.3',
 'Custos de entrega relacionados às vendas.',
 'Salário do entregador próprio, frete de compra de equipamentos, frete administrativo.',
 'Motoboy terceirizado; operador logístico; logística do marketplace; subsídio de entrega.',
 '{frete,entrega,motoboy,logistica,"taxa de entrega"}','{"salario entregador","frete compra"}',true,false,false,'variable_sales_expense',true,true,false,false,true,'v3'),
('2.4.4','2.4','Cupons, Cashback e Chargebacks',3,244,'despesa','saida','6.2.5',
 'Incentivos comerciais, devoluções e perdas relacionadas às vendas.',
 'Desconto concedido pelo marketplace sem custo para a empresa, comissão do aplicativo, devolução integral de venda que reduz a receita.',
 'Cupom financiado pelo restaurante; cashback; crédito promocional; chargeback perdido.',
 '{cupom,cashback,chargeback,promocional,"desconto comercial"}','{comissao,"desconto marketplace"}',true,false,false,'variable_sales_expense',true,true,false,false,true,'v3'),
('2.5','2','Estrutura e Operação',2,250,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.5.1','2.5','Aluguel, Condomínio e IPTU',3,251,'despesa','saida','6.1.1',
 'Despesas relacionadas à ocupação do imóvel.',
 'Reforma, energia, seguro, caução.',
 'Aluguel; condomínio; IPTU; fundo de promoção do shopping; taxa de ocupação.',
 '{aluguel,condominio,iptu,shopping,ocupacao}','{reforma,energia,seguro,caucao}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.5.2','2.5','Energia, Água e Gás',3,252,'despesa','saida','6.1.4',
 'Consumo de utilidades essenciais à operação.',
 'Combustível de veículos, manutenção de equipamentos, instalação de energia solar.',
 'Energia elétrica; água; esgoto; gás encanado; botijão de gás.',
 '{energia,luz,agua,esgoto,gas,botijao,saneamento}','{combustivel,manutencao,solar}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.5.3','2.5','Limpeza, Higiene, Segurança e Resíduos',3,253,'despesa','saida','6.1.9',
 'Materiais e serviços necessários à limpeza, higiene e segurança do estabelecimento.',
 'Embalagem entregue ao cliente, uniforme, reforma, manutenção de equipamento.',
 'Produtos de limpeza; papel higiênico; dedetização; coleta de resíduos; lavanderia; monitoramento.',
 '{limpeza,higiene,dedetizacao,residuo,lavanderia,seguranca,monitoramento}','{embalagem,uniforme,reforma}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.5.4','2.5','Manutenção e Locação de Equipamentos',3,254,'despesa','saida','6.1.13',
 'Manutenção, reparos e locações relacionados à estrutura e aos equipamentos.',
 'Compra de equipamento novo, reforma capitalizável, material de limpeza.',
 'Manutenção de geladeira; conserto de forno; ar-condicionado; manutenção predial; aluguel de equipamento.',
 '{manutencao,conserto,reparo,"aluguel de equipamento",predial,refrigeracao}','{"compra equipamento",reforma,limpeza}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.5.5','2.5','Sistemas, Internet e Telefonia',3,255,'despesa','saida','6.1.7',
 'Serviços recorrentes de tecnologia e comunicação.',
 'Computador, impressora, software adquirido como ativo, marketing digital.',
 'Sistema de PDV; sistema de gestão; internet; telefone; hospedagem; assinatura de software.',
 '{pdv,sistema,software,internet,telefonia,assinatura,hospedagem,saas}','{computador,impressora,marketing}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.6','2','Administração e Comercial',2,260,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.6.1','2.6','Contabilidade, Jurídico e Consultorias',3,261,'despesa','saida','6.3.1',
 'Serviços profissionais de apoio à gestão.',
 'Funcionário administrativo, software, taxa pública.',
 'Escritório contábil; advogado; consultoria financeira; consultoria gastronômica; auditoria.',
 '{contabilidade,contador,advogado,juridico,consultoria,auditoria,assessoria}','{salario,software,taxa}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.6.2','2.6','Marketing e Publicidade',3,262,'despesa','saida','6.5.1',
 'Divulgação, promoção e relacionamento com clientes.',
 'Cupom concedido na venda, comissão do marketplace, sistema de gestão.',
 'Agência; tráfego pago; fotografia; influenciador; material promocional; redes sociais; CRM.',
 '{marketing,publicidade,"trafego pago",agencia,influenciador,"redes sociais",crm}','{cupom,comissao,sistema}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.6.3','2.6','Seguros, Materiais e Outras Despesas Administrativas',3,263,'despesa','saida','6.3.15',
 'Despesas administrativas gerais que não se enquadram em categoria específica.',
 'Estoque, embalagem, equipamento, despesa pessoal do sócio.',
 'Seguros; papelaria; material de escritório; certificados digitais; cartório; associações.',
 '{seguro,papelaria,"material de escritorio",certificado,cartorio,associacao,correio}','{estoque,embalagem,equipamento}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.6.4','2.6','Veículos, Viagens e Mobilidade',3,264,'despesa','saida','6.6.1',
 'Despesas com veículos e deslocamentos administrativos ou operacionais.',
 'Compra de veículo, motoboy terceirizado de entrega, deslocamento particular.',
 'Combustível; manutenção de veículo; estacionamento; pedágio; aplicativo de transporte; viagem.',
 '{combustivel,gasolina,"manutencao veiculo",estacionamento,pedagio,uber,viagem,hospedagem}','{"compra de veiculo",motoboy}',true,false,false,'operating_expense',true,false,false,false,true,'v3'),
('2.7','2','Despesas Financeiras',2,270,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.7.1','2.7','Tarifas Bancárias',3,271,'despesa','saida','7.1.1',
 'Tarifas cobradas por bancos e instituições financeiras.',
 'Taxa de cartão, juros, antecipação de recebíveis.',
 'Mensalidade bancária; tarifa de boleto; tarifa de transferência; tarifa de saque.',
 '{tarifa,"tarifa bancaria",boleto,ted,doc,saque,"pacote de servicos"}','{"taxa de cartao",juros,antecipacao}',true,false,false,'financial_expense',true,false,false,false,true,'v3'),
('2.7.2','2.7','Juros e Multas Financeiras',3,272,'despesa','saida','7.2.6',
 'Juros e encargos de natureza financeira.',
 'Principal do empréstimo, multa tributária, taxa de cartão.',
 'Juros de empréstimo; juros de financiamento; juros por atraso; IOF; encargos bancários.',
 '{juros,iof,"multa contratual",encargo,mora}','{principal,"multa fiscal","taxa de cartao"}',true,false,false,'financial_expense',true,false,false,false,true,'v3'),
('2.7.3','2.7','Antecipação de Recebíveis',3,273,'despesa','saida','7.3.1',
 'Custos cobrados para antecipar valores que seriam recebidos futuramente.',
 'Taxa normal da venda no cartão, juros de empréstimo, comissão do marketplace.',
 'Antecipação de cartões; antecipação de repasses; desconto de recebíveis.',
 '{antecipacao,"desconto de recebiveis","antecipacao de cartao"}','{mdr,juros,comissao}',true,false,false,'financial_expense',true,false,false,false,true,'v3'),
('2.8','2','Investimentos',2,280,'investimento','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,false,false,false,true,false,'v3'),
('2.8.1','2.8','Equipamentos, Móveis e Tecnologia',3,281,'investimento','saida','1.2.2.1',
 'Aquisição de bens duráveis destinados à operação.',
 'Manutenção, assinatura mensal de software, utensílio de baixo valor, aluguel de equipamento.',
 'Forno; fogão; geladeira; freezer; computador; impressora; móveis; PDV.',
 '{forno,fogao,geladeira,freezer,computador,impressora,movel,equipamento,imobilizado}','{manutencao,assinatura,aluguel}',true,true,false,'asset_acquisition',false,false,false,true,true,'v3'),
('2.8.2','2.8','Reformas, Veículos e Outros Investimentos',3,282,'investimento','saida','1.2.2.8',
 'Investimentos de longo prazo não enquadrados na categoria anterior.',
 'Manutenção comum, combustível, aluguel, pequenos reparos.',
 'Reforma; benfeitoria; veículo; motocicleta; energia solar; instalação permanente; obra.',
 '{reforma,benfeitoria,obra,veiculo,motocicleta,"energia solar",instalacao}','{manutencao,combustivel,aluguel,reparo}',true,true,false,'asset_acquisition',false,false,false,true,true,'v3'),
('2.9','2','Sócios e Movimentos Patrimoniais',2,290,'patrimonial','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,false,false,false,true,false,'v3'),
('2.9.1','2.9','Distribuição de Lucros',3,291,'patrimonial','saida','3.5.1',
 'Pagamento de lucros formalmente apurados e destinados aos sócios.',
 'Pró-labore, adiantamento ao sócio, reembolso, despesa particular.',
 'Distribuição de lucros; dividendos.',
 '{lucro,dividendo,distribuicao,"distribuicao de lucros"}','{"pro-labore",reembolso,adiantamento}',true,true,false,'profit_distribution',false,false,false,true,true,'v3'),
('2.9.2','2.9','Reembolsos e Adiantamentos a Sócios',3,292,'patrimonial','saida','2.1.7.2',
 'Reembolso de despesas comprovadas ou valores temporariamente entregues aos sócios.',
 'Distribuição de lucro, pró-labore, retirada sem comprovação.',
 'Reembolso de compra paga pelo sócio; adiantamento para despesa; valor sujeito a prestação de contas.',
 '{"reembolso socio","adiantamento socio","prestacao de contas"}','{lucro,"pro-labore"}',true,true,false,'partner_reimbursement',false,false,false,true,true,'v3'),
('2.9.3','2.9','Amortização de Empréstimos e Financiamentos',3,293,'patrimonial','saida','2.1.4.5',
 'Pagamento do principal de empréstimos e financiamentos. Os juros devem ser registrados em Juros e Multas Financeiras.',
 'Juros, multas, tarifas, aquisição do bem financiado.',
 'Parcela de empréstimo (principal); amortização de financiamento.',
 '{amortizacao,"principal do emprestimo","parcela de financiamento"}','{juros,tarifa,multa}',true,true,false,'loan_principal_payment',false,false,false,true,true,'v3'),
('2.9.4','2.9','Pagamentos entre Empresas e Outros Movimentos Patrimoniais',3,294,'patrimonial','saida','2.1.7.1',
 'Movimentações que não representam despesas da operação.',
 'Fornecedor comum, despesa operacional, transferência entre contas da mesma empresa.',
 'Pagamento a empresa relacionada; caução; depósito judicial; devolução de adiantamento; devolução de capital.',
 '{"empresa relacionada",caucao,"deposito judicial","devolucao de capital"}','{fornecedor,transferencia}',true,true,false,'patrimonial_movement',false,false,false,true,true,'v3'),
('2.10','2','Outras Saídas',2,300,'despesa','saida',NULL,NULL,NULL,NULL,'{}','{}',false,false,false,NULL,true,false,false,false,false,'v3'),
('2.10.1','2.10','Indenizações, Doações e Despesas Eventuais',3,301,'despesa','saida','6.8.6',
 'Saídas eventuais que não pertencem à operação normal.',
 'Despesa operacional identificável, pagamento a sócio, multa financeira, tributo.',
 'Indenização paga; doação; perda extraordinária; acordo não recorrente.',
 '{indenizacao,doacao,acordo,"despesa eventual","perda extraordinaria"}','{socio,tributo,"multa financeira"}',true,true,false,'operating_expense',true,false,false,false,true,'v3'),
('2.10.2','2.10','Valores a Classificar',3,302,'despesa','saida','9.5.2',
 'Use temporariamente quando não houver informações suficientes para classificar o lançamento. Deve ser revisado e reclassificado.',
 'Qualquer lançamento cuja natureza já seja conhecida.',
 'Débito sem identificação; lançamento importado sem descrição.',
 '{"a classificar","sem identificacao",diversos}','{}',true,true,true,'temporary_control',false,false,false,false,true,'v3'),
('3',NULL,'Transferências',1,400,'transferencia','transferencia',NULL,
 'Transferências não representam receita nem despesa.',NULL,NULL,'{}','{}',false,false,false,'transfer',false,false,false,true,false,'v3'),
('3.1','3','Transferências entre Contas da Empresa',2,410,'transferencia','transferencia','9.4.1',
 'Movimentações entre contas da própria empresa. A conta contábil é derivada da origem e do destino.',
 'Pagamentos a terceiros, receitas, despesas.',
 'Banco para banco; banco para caixa; caixa para banco; aplicação e resgate.',
 '{transferencia,ted,pix,"entre contas",aplicacao,resgate}','{fornecedor,venda,despesa}',true,false,false,'transfer',false,false,false,true,true,'v3'),
('3.2','3','Transferências entre Empresas ou Unidades',2,420,'transferencia','transferencia','9.4.4',
 'Movimentos entre empresas juridicamente diferentes ou unidades com controle separado. Geram contas entre empresas relacionadas.',
 'Transferência entre contas da mesma empresa, despesa operacional.',
 'Repasse entre unidades; transferência para empresa do grupo.',
 '{"entre empresas","entre unidades",grupo,matriz,filial}','{fornecedor,despesa}',true,true,false,'patrimonial_movement',false,false,false,true,true,'v3');

-- 3) Seeder propaga os novos metadados
CREATE OR REPLACE FUNCTION public.seed_default_categories(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _tpl record;
  _parent_id uuid;
  _new_id uuid;
  _existing_id uuid;
  _chart_id uuid;
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

    _chart_id := NULL;
    IF _tpl.chart_account_code IS NOT NULL THEN
      SELECT ca.id INTO _chart_id
        FROM public.chart_accounts ca
        JOIN public.chart_account_companies cac
          ON cac.chart_account_id = ca.id AND cac.company_id = _company_id
       WHERE ca.code = _tpl.chart_account_code
       LIMIT 1;
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
      UPDATE public.categories
         SET chart_account_id = COALESCE(chart_account_id, _chart_id),
             guidance_include = _tpl.guidance_include,
             guidance_exclude = _tpl.guidance_exclude,
             keywords = _tpl.keywords,
             ai_excluded_keywords = _tpl.ai_excluded_keywords,
             examples = _tpl.examples,
             in_dre = _tpl.in_dre,
             is_contribution_margin = _tpl.is_contribution_margin,
             is_cmv = _tpl.is_cmv,
             is_patrimonial = _tpl.is_patrimonial,
             allow_transactions = _tpl.allow_transactions,
             requires_review = _tpl.requires_review,
             temporary_category = _tpl.temporary_category,
             accounting_behavior = _tpl.accounting_behavior,
             template_version = _tpl.template_version
       WHERE id = _existing_id;
    ELSE
      INSERT INTO public.categories (
        user_id, company_id, parent_id, name, transaction_type, context,
        sort_order, is_system, visible_pf,
        template_code, category_subtype, ai_description, previous_index,
        is_customizable, is_active, chart_account_id,
        guidance_include, guidance_exclude, keywords, examples,
        in_dre, is_contribution_margin, is_cmv, is_patrimonial,
        allow_transactions, requires_review, temporary_category,
        accounting_behavior, ai_excluded_keywords, template_version
      ) VALUES (
        _owner, _company_id, _parent_id, _tpl.name, _tpl.transaction_type, 'pj',
        _tpl.sort_order, false, false,
        _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index,
        _tpl.is_customizable, true, _chart_id,
        _tpl.guidance_include, _tpl.guidance_exclude, _tpl.keywords, _tpl.examples,
        _tpl.in_dre, _tpl.is_contribution_margin, _tpl.is_cmv, _tpl.is_patrimonial,
        _tpl.allow_transactions, _tpl.requires_review, _tpl.temporary_category,
        _tpl.accounting_behavior, _tpl.ai_excluded_keywords, _tpl.template_version
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
$fn$;

-- 4) Categorias agrupadoras existentes não recebem lançamentos
UPDATE public.categories c
   SET allow_transactions = false
 WHERE EXISTS (SELECT 1 FROM public.categories f WHERE f.parent_id = c.id);