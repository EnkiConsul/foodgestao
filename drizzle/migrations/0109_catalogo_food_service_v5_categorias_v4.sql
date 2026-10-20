
-- Catálogo food service: plano de contas food_service_v5 + categorias v4.
-- Idempotente: nunca apaga nem renumera códigos; não toca lançamentos.

ALTER TABLE public.category_template_chart_links_log
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS category_id uuid;

CREATE OR REPLACE FUNCTION public.category_templates_validate_chart_account()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE _acc record; _root text; _non_result boolean;
BEGIN
  IF NEW.chart_account_code IS NULL THEN RETURN NEW; END IF;
  SELECT code, name, is_synthetic, is_reducer INTO _acc FROM public.chart_account_templates WHERE code = NEW.chart_account_code;
  IF _acc.code IS NULL THEN RAISE EXCEPTION 'Conta contábil padrão % não existe.', NEW.chart_account_code USING ERRCODE = '22023'; END IF;
  IF _acc.is_synthetic THEN
    RAISE EXCEPTION 'A conta % — % é sintética (agrupadora) e não recebe lançamentos. Escolha uma conta analítica.', _acc.code, _acc.name USING ERRCODE = '22023';
  END IF;
  _root := split_part(_acc.code, '.', 1);
  _non_result := COALESCE(NEW.subtype, '') IN ('investimento','patrimonial','transferencia') OR COALESCE(NEW.is_patrimonial, false);
  IF _non_result THEN
    IF _root NOT IN ('1','2','3','9') THEN
      RAISE EXCEPTION 'Categorias de investimento, patrimoniais ou de transferência devem usar contas de Ativo, Passivo, Patrimônio Líquido ou de controle (grupos 1, 2, 3 ou 9). A conta % está no grupo %.', _acc.code, _root USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF _root IN ('1','2','3') THEN
    RAISE EXCEPTION 'A conta % é patrimonial. Categorias de resultado só podem usar contas de Receitas, Custos, Despesas ou Impostos.', _acc.code USING ERRCODE = '22023';
  END IF;
  IF _root NOT IN ('4','5','6','7','8','9') THEN
    RAISE EXCEPTION 'A conta % não pertence a um grupo de resultado válido.', _acc.code USING ERRCODE = '22023';
  END IF;
  IF NEW.transaction_type = 'entrada' AND _root IN ('5','6','7','8') THEN
    RAISE EXCEPTION 'Categoria de Entrada não pode usar a conta % (grupo %). Use uma conta do grupo 4 — Receitas.', _acc.code, _root USING ERRCODE = '22023';
  END IF;
  IF NEW.transaction_type = 'saida' AND _root = '4' AND NOT COALESCE(_acc.is_reducer, false) THEN
    RAISE EXCEPTION 'Categoria de Saída não pode usar a conta % (Receitas). Use uma conta de Custos, Despesas, Impostos ou uma dedução da receita (4.3).', _acc.code USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.chart_account_templates SET name = '(-) Descontos, Cortesias e Promoções'
 WHERE code = '4.3.1' AND name IS DISTINCT FROM '(-) Descontos, Cortesias e Promoções';
UPDATE public.chart_account_templates SET name = 'Pessoal Administrativo e Gestão'
 WHERE code = '6.3.2' AND name IS DISTINCT FROM 'Pessoal Administrativo e Gestão';

INSERT INTO public.chart_account_templates (
  code, parent_code, name, is_synthetic, is_tax, ai_description, sort_order, template_key, template_version,
  usage_description, keywords, excluded_keywords, allowed_category_subtypes, allowed_transaction_types,
  requires_review, is_dynamic, is_reducer, is_active, dre_line, allow_transactions, normal_balance,
  statement_group, cash_flow_behavior, temporary_account)
SELECT n.code, s.parent_code, n.name, false, n.is_tax, n.ai_description, n.sort_order, n.template_key, 'food_service_v5',
  n.usage_description, n.keywords, n.excluded_keywords, n.subtypes, n.types,
  false, false, n.is_reducer, true, n.dre_line, true, 'debito', s.statement_group, 'operacional', false
FROM (VALUES
  ('4.3.2','4.3.1','(-) Cancelamentos, Estornos e Chargebacks','revenue.cancellations',645,true,false,'deducoes_receita',
   'Reduções da receita bruta por vendas canceladas, estornadas ou contestadas (chargeback).',
   'Use para cancelamentos de pedidos, estornos de vendas e chargebacks de cartão ou marketplace.',
   ARRAY['cancelamento','estorno','chargeback','contestacao','pedido cancelado'], ARRAY['desconto','cashback','cupom','taxa'],
   ARRAY['despesa','imposto','receita'], ARRAY['saida','entrada']),
  ('6.2.6','6.2.5','Entretenimento, Cachês e Direitos Autorais','expense.structure.entertainment',885,false,false,'entretenimento_musica',
   'Custos com música ao vivo, artistas, DJs, som e direitos autorais (ECAD).',
   'Use para cachês de artistas, bandas, DJs, locação de som para shows e boletos do ECAD.',
   ARRAY['cache','artista','banda','dj','ecad','som','musica ao vivo'], ARRAY['couvert recebido','marketing','salario'],
   ARRAY['despesa'], ARRAY['saida']),
  ('6.3.6','6.3.5','Encargos e Benefícios Administrativos','expense.admin.benefits',945,false,false,'pessoal_administrativo',
   'Encargos e benefícios da equipe administrativa e de gestão.',
   'Use para INSS, FGTS, férias, 13º, VT, VA e plano de saúde de quem atua no administrativo/gestão.',
   ARRAY['inss','fgts','ferias','decimo terceiro','vale transporte','vale alimentacao','plano de saude'], ARRAY['salario','pro-labore','operacional','cozinha'],
   ARRAY['despesa'], ARRAY['saida']),
  ('6.3.7','6.3.5','Pró-Labore','expense.admin.prolabore',946,false,false,'pro_labore',
   'Remuneração mensal dos sócios pelo trabalho na empresa (pró-labore).',
   'Use somente para pró-labore. Distribuição de lucros vai para o patrimônio líquido.',
   ARRAY['pro-labore','prolabore','remuneracao socio'], ARRAY['lucro','dividendo','reembolso','emprestimo'],
   ARRAY['despesa'], ARRAY['saida']),
  ('6.3.8','6.3.5','Despesas Eventuais, Indenizações e Doações','expense.admin.eventual',947,false,false,'outras_despesas_operacionais',
   'Despesas não recorrentes: indenizações, acordos, doações e perdas extraordinárias.',
   'Use para gastos eventuais que não pertencem a outra conta da operação.',
   ARRAY['indenizacao','doacao','acordo','despesa eventual','perda extraordinaria'], ARRAY['socio','tributo','multa financeira'],
   ARRAY['despesa'], ARRAY['saida']),
  ('7.1.3','7.1.2','Deságio de Antecipação de Recebíveis','expense.financial.receivables_discount',1020,false,false,'despesas_financeiras',
   'Custo financeiro (deságio) cobrado para antecipar recebíveis de cartão ou marketplace.',
   'Use para o desconto cobrado na antecipação. A taxa normal do cartão (MDR) vai em despesas variáveis de venda.',
   ARRAY['antecipacao','desagio','desconto de recebiveis','antecipacao de cartao'], ARRAY['mdr','comissao','tarifa'],
   ARRAY['despesa'], ARRAY['saida']),
  ('8.3.2','8.3.1','Multas e Encargos Tributários','tax.penalties',1105,false,true,'outras_despesas_operacionais',
   'Multas, juros e encargos por atraso ou infração tributária.',
   'Use para multas fiscais, juros sobre tributos e encargos de parcelamentos tributários.',
   ARRAY['multa fiscal','juros sobre tributo','parcelamento','penalidade'], ARRAY['juros bancarios','fornecedor'],
   ARRAY['imposto','despesa'], ARRAY['saida'])
) AS n(code, sibling, name, template_key, sort_order, is_reducer, is_tax, dre_line, ai_description, usage_description, keywords, excluded_keywords, subtypes, types)
JOIN public.chart_account_templates s ON s.code = n.sibling
ON CONFLICT (code) DO NOTHING;

UPDATE public.chart_account_templates SET template_version = 'food_service_v5'
 WHERE template_version IS DISTINCT FROM 'food_service_v5';

UPDATE public.category_templates SET name = 'Eventos, Couvert Artístico, Encomendas e Serviços',
  keywords = ARRAY['evento','buffet','catering','coffee break','encomenda','festa','corporativo','couvert','artistico']
 WHERE code = '1.1.4' AND name IS DISTINCT FROM 'Eventos, Couvert Artístico, Encomendas e Serviços';

UPDATE public.category_templates SET requires_review = true,
  ai_description = 'Valores devolvidos à empresa por despesas pagas antes (ex.: reembolso de fornecedor ou de sócio). O ideal é abater o valor da despesa de origem; use esta categoria só quando não for possível.'
 WHERE code = '1.2.2' AND ai_description IS DISTINCT FROM 'Valores devolvidos à empresa por despesas pagas antes (ex.: reembolso de fornecedor ou de sócio). O ideal é abater o valor da despesa de origem; use esta categoria só quando não for possível.';

UPDATE public.category_templates SET is_contribution_margin = true WHERE code IN ('2.1','2.1.1') AND NOT is_contribution_margin;
UPDATE public.category_templates SET chart_account_code = '8.3.2' WHERE code = '2.1.3' AND chart_account_code IS DISTINCT FROM '8.3.2';
UPDATE public.category_templates SET chart_account_code = '7.1.3' WHERE code = '2.7.3' AND chart_account_code IS DISTINCT FROM '7.1.3';
UPDATE public.category_templates SET chart_account_code = '6.3.8' WHERE code = '2.10.1' AND chart_account_code IS DISTINCT FROM '6.3.8';
UPDATE public.category_templates SET chart_account_code = '6.3.7' WHERE code = '2.3.5' AND chart_account_code IS DISTINCT FROM '6.3.7';
UPDATE public.category_templates SET name = 'Encargos e Benefícios Operacionais', subtype = 'custo'
 WHERE code = '2.3.4' AND (name IS DISTINCT FROM 'Encargos e Benefícios Operacionais' OR subtype IS DISTINCT FROM 'custo');
UPDATE public.category_templates SET name = 'Cashback e Programas de Fidelidade',
  keywords = ARRAY['cashback','fidelidade','programa de pontos','clube de vantagens'],
  ai_excluded_keywords = ARRAY['comissao','desconto marketplace','cupom','chargeback','cancelamento']
 WHERE code = '2.4.4' AND name IS DISTINCT FROM 'Cashback e Programas de Fidelidade';

INSERT INTO public.category_templates (code, parent_code, name, level, sort_order, subtype, transaction_type, ai_description,
  is_customizable, chart_account_code, guidance_include, guidance_exclude, keywords, examples, in_dre, is_contribution_margin,
  is_cmv, is_patrimonial, allow_transactions, requires_review, accounting_behavior, ai_excluded_keywords, template_version)
VALUES
 ('1.3.5','1.3','Gorjetas e Taxa de Serviço Recebidas',3,155,'patrimonial','entrada',
  'Gorjetas e taxa de serviço (10%) cobradas dos clientes. Pertencem aos empregados (Lei 13.419/2017): não são receita, faturamento nem entram no ticket médio.',
  true,'2.6.1','Taxa de serviço e gorjetas recebidas no salão, maquininha ou app.','Vendas, couvert, receitas de eventos.',
  ARRAY['gorjeta','taxa de servico','10%','servico garcom','caixinha'],'Taxa de serviço do fechamento do dia; gorjeta no cartão.',
  false,false,false,true,true,false,'tips_received',ARRAY['venda','couvert','delivery','faturamento'],'v4'),
 ('2.9.5','2.9','Repasse de Gorjetas e Taxa de Serviço',3,295,'patrimonial','saida',
  'Repasse aos empregados das gorjetas e taxa de serviço arrecadadas. Retenções legais são parametrizadas por empresa, não fixas.',
  true,'2.6.1','Pagamento ou rateio da taxa de serviço/gorjeta à equipe.','Salários, comissões, prêmios.',
  ARRAY['repasse gorjeta','rateio taxa de servico','pagamento gorjeta','caixinha equipe'],'Rateio mensal dos 10% para a equipe.',
  false,false,false,true,true,false,'tips_payout',ARRAY['salario','comissao','bonus','premio'],'v4'),
 ('2.11','2','Deduções da Receita',2,310,'despesa','saida',
  'Reduções diretas da receita bruta: descontos, cortesias, promoções, cancelamentos, estornos e chargebacks.',
  false,NULL,NULL,NULL,'{}',NULL,true,true,false,false,false,false,NULL,'{}','v4'),
 ('2.11.1','2.11','Descontos, Cortesias e Promoções',3,311,'despesa','saida',
  'Descontos concedidos, cortesias, cupons e promoções que reduzem o valor vendido.',
  true,'4.3.1','Cupons, descontos no caixa, cortesias, promoções.','Cashback e programas de fidelidade (2.4.4); comissões.',
  ARRAY['desconto','cortesia','cupom','promocao','promocional','desconto comercial'],'Cupom de 10% no app; cortesia da casa.',
  true,true,false,false,true,false,'revenue_deduction',ARRAY['cashback','fidelidade','comissao','chargeback'],'v4'),
 ('2.11.2','2.11','Cancelamentos, Estornos e Chargebacks',3,312,'despesa','saida',
  'Vendas canceladas, estornadas ou contestadas que reduzem a receita.',
  true,'4.3.2','Pedidos cancelados, estornos de cartão, chargebacks.','Taxas de cartão (2.4.2); descontos (2.11.1).',
  ARRAY['cancelamento','estorno','chargeback','contestacao','pedido cancelado'],'Chargeback de cartão; estorno no iFood.',
  true,true,false,false,true,false,'revenue_deduction',ARRAY['desconto','cashback','taxa','mdr'],'v4'),
 ('2.1.4','2.1','IRPJ e CSLL',3,214,'imposto','saida',
  'Tributos sobre o lucro (IRPJ e CSLL) no Lucro Presumido ou Real. No Simples Nacional já estão dentro do DAS.',
  true,'8.2.1','DARF de IRPJ e CSLL.','DAS do Simples, ISS, ICMS, PIS/COFINS.',
  ARRAY['irpj','csll','darf irpj','imposto de renda pj'],'DARF trimestral de IRPJ.',
  true,false,false,false,true,false,'tax_payment',ARRAY['das','simples','iss','icms','irrf funcionario'],'v4'),
 ('2.3.6','2.3','Encargos e Benefícios Administrativos',3,236,'despesa','saida',
  'Encargos e benefícios da equipe administrativa e de gestão.',
  true,'6.3.6','INSS, FGTS, férias, 13º, VT, VA e plano de saúde do administrativo.','Equipe de cozinha/salão (2.3.4); pró-labore (2.3.5).',
  ARRAY['encargos administrativo','beneficios administrativo','plano de saude gestao','fgts administrativo'],'FGTS do gerente; VT do financeiro.',
  true,false,false,false,true,false,'labor_cost',ARRAY['pro-labore','cozinha','salao','operacional'],'v4'),
 ('2.5.6','2.5','Entretenimento, Cachês e Direitos Autorais (ECAD)',3,256,'despesa','saida',
  'Música ao vivo, cachês de artistas, DJs, som e direitos autorais (ECAD).',
  true,'6.2.6','Cachês, bandas, DJs, locação de som para show, ECAD.','Marketing, salários, couvert recebido.',
  ARRAY['cache','artista','banda','dj','ecad','som','musica ao vivo'],'Cachê da banda de sexta; boleto do ECAD.',
  true,false,false,false,true,false,'operating_expense',ARRAY['couvert','marketing','salario','sistema de som pdv'],'v4')
ON CONFLICT (code) DO NOTHING;

UPDATE public.category_templates SET template_version = 'v4' WHERE template_version IS DISTINCT FROM 'v4';

INSERT INTO public.category_template_chart_links_log (batch_id, category_code, category_name, previous_chart_account_code, new_chart_account_code, chart_account_name, rationale, source)
SELECT 'c4f5e000-0000-4000-8000-000000000045'::uuid, v.code, t.name, v.prev, v.new, a.name, v.why, 'catalogo_v4_migration'
FROM (VALUES
  ('2.3.5','6.3.2','6.3.7','Pró-labore separado da folha administrativa no DRE'),
  ('2.1.3',NULL,'8.3.2','Multas tributárias passam a ter conta própria'),
  ('2.7.3',NULL,'7.1.3','Deságio de antecipação é despesa financeira'),
  ('2.10.1',NULL,'6.3.8','Despesas eventuais ganham conta própria'),
  ('1.3.5',NULL,'2.6.1','Gorjetas recebidas são passivo (Lei 13.419/2017)'),
  ('2.9.5',NULL,'2.6.1','Repasse de gorjetas baixa o passivo'),
  ('2.11.1',NULL,'4.3.1','Descontos e cortesias deduzem a receita'),
  ('2.11.2',NULL,'4.3.2','Cancelamentos e chargebacks deduzem a receita'),
  ('2.1.4',NULL,'8.2.1','IRPJ/CSLL abaixo do resultado operacional'),
  ('2.3.6',NULL,'6.3.6','Encargos administrativos separados dos operacionais'),
  ('2.5.6',NULL,'6.2.6','Entretenimento com conta própria')
) v(code, prev, new, why)
JOIN public.category_templates t ON t.code = v.code
LEFT JOIN public.chart_account_templates a ON a.code = v.new
WHERE NOT EXISTS (SELECT 1 FROM public.category_template_chart_links_log l
  WHERE l.batch_id = 'c4f5e000-0000-4000-8000-000000000045'::uuid AND l.category_code = v.code AND l.company_id IS NULL);

CREATE OR REPLACE FUNCTION private.catalogo_v4_sincronizar(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid; _tpl record; _parent uuid; _id uuid; _created int := 0; _linked int := 0; _r record;
  _batch constant uuid := 'c4f5e000-0000-4000-8000-000000000045';
BEGIN
  SELECT user_id INTO _owner FROM public.companies WHERE id = _company_id;
  IF _owner IS NULL THEN RETURN '{}'::jsonb; END IF;

  PERFORM public.chart_accounts_seed_tree(_owner, 'pj'::context_type, _company_id);
  UPDATE public.chart_accounts SET name = '(-) Descontos, Cortesias e Promoções'
   WHERE user_id = _owner AND context = 'pj' AND template_key = 'revenue.deductions' AND name = '(-) Cancelamentos, Devoluções e Descontos';
  UPDATE public.chart_accounts SET name = 'Pessoal Administrativo e Gestão'
   WHERE user_id = _owner AND context = 'pj' AND template_key = 'expense.admin.payroll' AND name = 'Pessoal Administrativo, Gestão e Pró-Labore';

  UPDATE public.categories c SET name = v.novo
    FROM (VALUES ('1.1.4','Eventos, Encomendas e Serviços','Eventos, Couvert Artístico, Encomendas e Serviços'),
                 ('2.3.4','Encargos e Benefícios','Encargos e Benefícios Operacionais'),
                 ('2.4.4','Cupons, Cashback e Chargebacks','Cashback e Programas de Fidelidade')) v(code, antigo, novo)
   WHERE c.company_id = _company_id AND c.template_code = v.code AND c.name = v.antigo;

  FOR _tpl IN SELECT * FROM public.category_templates ORDER BY level, sort_order LOOP
    IF EXISTS (SELECT 1 FROM public.categories WHERE company_id = _company_id AND template_code = _tpl.code) THEN CONTINUE; END IF;
    _parent := NULL;
    IF _tpl.parent_code IS NOT NULL THEN
      SELECT id INTO _parent FROM public.categories WHERE company_id = _company_id AND template_code = _tpl.parent_code LIMIT 1;
      IF _parent IS NULL THEN CONTINUE; END IF;
    END IF;
    INSERT INTO public.categories (user_id, company_id, parent_id, name, transaction_type, context, sort_order, is_system, visible_pf,
      template_code, category_subtype, ai_description, previous_index, is_customizable, is_active)
    VALUES (_owner, _company_id, _parent, _tpl.name, _tpl.transaction_type, 'pj', _tpl.sort_order, false, false,
      _tpl.code, _tpl.subtype, _tpl.ai_description, _tpl.previous_index, _tpl.is_customizable, true)
    RETURNING id INTO _id;
    INSERT INTO public.category_companies (category_id, company_id) VALUES (_id, _company_id) ON CONFLICT DO NOTHING;
    _created := _created + 1;
  END LOOP;

  UPDATE public.categories c SET
      category_subtype = t.subtype, guidance_include = t.guidance_include, guidance_exclude = t.guidance_exclude,
      keywords = t.keywords, ai_excluded_keywords = t.ai_excluded_keywords, examples = t.examples,
      ai_description = COALESCE(t.ai_description, c.ai_description),
      in_dre = t.in_dre, is_contribution_margin = t.is_contribution_margin, is_cmv = t.is_cmv, is_patrimonial = t.is_patrimonial,
      allow_transactions = t.allow_transactions, requires_review = t.requires_review, temporary_category = t.temporary_category,
      accounting_behavior = t.accounting_behavior, template_version = t.template_version
    FROM public.category_templates t
   WHERE c.company_id = _company_id AND c.template_code = t.code
     AND (c.category_subtype, c.guidance_include, c.guidance_exclude, c.keywords, c.ai_excluded_keywords, c.examples,
          c.ai_description, c.in_dre, c.is_contribution_margin, c.is_cmv, c.is_patrimonial,
          c.allow_transactions, c.requires_review, c.temporary_category, c.accounting_behavior, c.template_version)
         IS DISTINCT FROM
         (t.subtype, t.guidance_include, t.guidance_exclude, t.keywords, t.ai_excluded_keywords, t.examples,
          COALESCE(t.ai_description, c.ai_description), t.in_dre, t.is_contribution_margin, t.is_cmv, t.is_patrimonial,
          t.allow_transactions, t.requires_review, t.temporary_category, t.accounting_behavior, t.template_version);

  FOR _r IN
    SELECT c.id AS category_id, c.name AS category_name, c.template_code, old.code AS prev_code, ca.id AS new_id, ca.code AS new_code, ca.name AS new_name
      FROM public.categories c
      JOIN public.category_templates t ON t.code = c.template_code AND t.chart_account_code IS NOT NULL
      JOIN public.chart_account_companies cac ON cac.company_id = c.company_id
      JOIN public.chart_accounts ca ON ca.id = cac.chart_account_id AND ca.code = t.chart_account_code
      LEFT JOIN public.chart_accounts old ON old.id = c.chart_account_id
     WHERE c.company_id = _company_id
       AND (c.chart_account_id IS NULL OR (c.template_code = '2.3.5' AND old.code = '6.3.2'))
       AND c.chart_account_id IS DISTINCT FROM ca.id
  LOOP
    UPDATE public.categories SET chart_account_id = _r.new_id WHERE id = _r.category_id;
    INSERT INTO public.category_template_chart_links_log (batch_id, category_code, category_name, previous_chart_account_code,
      new_chart_account_code, chart_account_name, rationale, source, company_id, category_id)
    VALUES (_batch, _r.template_code, _r.category_name, _r.prev_code, _r.new_code, _r.new_name,
      CASE WHEN _r.prev_code IS NULL THEN 'Backfill: categoria padrão sem conta contábil' ELSE 'Pró-labore separado (6.3.2 → 6.3.7)' END,
      'catalogo_v4_backfill', _company_id, _r.category_id);
    _linked := _linked + 1;
  END LOOP;

  RETURN jsonb_build_object('criadas', _created, 'vinculadas', _linked);
END;
$function$;
REVOKE ALL ON FUNCTION private.catalogo_v4_sincronizar(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.categories_autolink_chart_account()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.chart_account_id IS NULL AND NEW.template_code IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    SELECT ca.id INTO NEW.chart_account_id
      FROM public.category_templates t
      JOIN public.chart_account_companies cac ON cac.company_id = NEW.company_id
      JOIN public.chart_accounts ca ON ca.id = cac.chart_account_id AND ca.code = t.chart_account_code
     WHERE t.code = NEW.template_code LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.categories_autolink_chart_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_categories_zz_autolink_chart ON public.categories;
CREATE TRIGGER trg_categories_zz_autolink_chart BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_autolink_chart_account();

CREATE OR REPLACE FUNCTION public.companies_catalogo_v4_on_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM private.catalogo_v4_sincronizar(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'catalogo_v4_sincronizar failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.companies_catalogo_v4_on_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_companies_catalogo_v4 ON public.companies;
CREATE TRIGGER zz_companies_catalogo_v4 AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_catalogo_v4_on_insert();

CREATE TABLE IF NOT EXISTS public.finance_gorjeta_config (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  retencao_percentual numeric(5,2) CHECK (retencao_percentual IS NULL OR (retencao_percentual >= 0 AND retencao_percentual <= 100)),
  observacao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.finance_gorjeta_config TO authenticated;
GRANT ALL ON public.finance_gorjeta_config TO service_role;
ALTER TABLE public.finance_gorjeta_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gorjeta_config_read ON public.finance_gorjeta_config;
CREATE POLICY gorjeta_config_read ON public.finance_gorjeta_config FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));
DROP POLICY IF EXISTS gorjeta_config_owner_write ON public.finance_gorjeta_config;
CREATE POLICY gorjeta_config_owner_write ON public.finance_gorjeta_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.catalogo_v4_revisao(_company_id uuid)
 RETURNS TABLE(template_code text, categoria text, lancamentos bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.template_code, c.name, count(t.id)
    FROM public.categories c JOIN public.transactions t ON t.category_id = c.id
   WHERE c.company_id = _company_id AND c.template_code IN ('2.4.4','2.3.4','2.3.5')
     AND t.created_at < timestamptz '2026-10-21 00:00:00-03'
   GROUP BY 1, 2 HAVING count(t.id) > 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.catalogo_v4_revisao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_v4_revisao(uuid) TO authenticated;

DO $$
DECLARE _c uuid;
BEGIN
  FOR _c IN SELECT DISTINCT company_id FROM public.categories
             WHERE company_id IS NOT NULL AND template_code IN (SELECT code FROM public.category_templates)
  LOOP
    PERFORM private.catalogo_v4_sincronizar(_c);
  END LOOP;
END $$;
