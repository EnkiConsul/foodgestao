
-- ============================================================================
-- 1) TABELA: dre_rubricas (catálogo global de rubricas contábeis da DRE)
-- ============================================================================
CREATE TABLE public.dre_rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  grupo_pai_codigo text,
  tipo text CHECK (tipo IN (
    'receita_bruta','deducao_receita','custo_servico',
    'despesa_vendas','despesa_administrativa','outras_despesas_op',
    'outras_receitas_op','receita_financeira','despesa_financeira',
    'provisao_irpj_csll'
  )),
  natureza text NOT NULL CHECK (natureza IN ('credora','devedora')),
  is_calculada boolean NOT NULL DEFAULT false,
  formula text,
  ordem integer NOT NULL,
  visivel boolean NOT NULL DEFAULT true,
  editavel_usuario boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dre_rubricas TO authenticated;
GRANT ALL ON public.dre_rubricas TO service_role;
ALTER TABLE public.dre_rubricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read dre_rubricas"
  ON public.dre_rubricas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage dre_rubricas"
  ON public.dre_rubricas FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_dre_rubricas_updated_at BEFORE UPDATE ON public.dre_rubricas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2) TABELA: dre_categoria_mapeamento (categoria → rubrica, por empresa)
-- ============================================================================
CREATE TABLE public.dre_categoria_mapeamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  rubrica_id uuid NOT NULL REFERENCES public.dre_rubricas(id) ON DELETE RESTRICT,
  percentual_alocacao numeric(5,2) NOT NULL DEFAULT 100.00 CHECK (percentual_alocacao > 0 AND percentual_alocacao <= 100),
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, categoria_id, rubrica_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_categoria_mapeamento TO authenticated;
GRANT ALL ON public.dre_categoria_mapeamento TO service_role;
CREATE INDEX idx_dre_map_company ON public.dre_categoria_mapeamento(company_id);
CREATE INDEX idx_dre_map_categoria ON public.dre_categoria_mapeamento(categoria_id);
CREATE INDEX idx_dre_map_rubrica ON public.dre_categoria_mapeamento(rubrica_id);
ALTER TABLE public.dre_categoria_mapeamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read mapping"
  ON public.dre_categoria_mapeamento FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "Admins write mapping"
  ON public.dre_categoria_mapeamento FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dre_map_updated_at BEFORE UPDATE ON public.dre_categoria_mapeamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) TABELA: dre_ajustes_manuais
-- ============================================================================
CREATE TABLE public.dre_ajustes_manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rubrica_id uuid NOT NULL REFERENCES public.dre_rubricas(id) ON DELETE RESTRICT,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  valor numeric(15,2) NOT NULL,
  descricao text NOT NULL,
  tipo_ajuste text NOT NULL CHECK (tipo_ajuste IN ('adicionar','subtrair','substituir')),
  justificativa text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_ajustes_manuais TO authenticated;
GRANT ALL ON public.dre_ajustes_manuais TO service_role;
CREATE INDEX idx_dre_ajustes_company_periodo ON public.dre_ajustes_manuais(company_id, periodo_inicio, periodo_fim);
CREATE INDEX idx_dre_ajustes_rubrica ON public.dre_ajustes_manuais(rubrica_id);
ALTER TABLE public.dre_ajustes_manuais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read adjustments"
  ON public.dre_ajustes_manuais FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "Admins write adjustments"
  ON public.dre_ajustes_manuais FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins update adjustments"
  ON public.dre_ajustes_manuais FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins delete adjustments"
  ON public.dre_ajustes_manuais FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dre_ajustes_updated_at BEFORE UPDATE ON public.dre_ajustes_manuais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4) TABELA: dre_snapshots
-- ============================================================================
CREATE TABLE public.dre_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  tipo_periodo text NOT NULL CHECK (tipo_periodo IN ('mensal','trimestral','semestral','anual','personalizado')),
  regime text NOT NULL DEFAULT 'caixa' CHECK (regime IN ('caixa','competencia')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','auditado')),
  dados_json jsonb NOT NULL,
  total_receita_bruta numeric(15,2),
  total_receita_liquida numeric(15,2),
  lucro_bruto numeric(15,2),
  ebit numeric(15,2),
  lair numeric(15,2),
  lucro_liquido numeric(15,2),
  observacoes text,
  gerado_por uuid,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  publicado_por uuid,
  publicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_snapshots TO authenticated;
GRANT ALL ON public.dre_snapshots TO service_role;
CREATE INDEX idx_dre_snap_company_periodo ON public.dre_snapshots(company_id, periodo_inicio, periodo_fim);
ALTER TABLE public.dre_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read snapshots"
  ON public.dre_snapshots FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "Admins insert snapshots"
  ON public.dre_snapshots FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins update draft snapshots"
  ON public.dre_snapshots FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins delete draft snapshots"
  ON public.dre_snapshots FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) AND status = 'rascunho');
CREATE TRIGGER trg_dre_snap_updated_at BEFORE UPDATE ON public.dre_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Impede alteração de snapshot publicado/auditado (imutabilidade)
CREATE OR REPLACE FUNCTION public.dre_snapshot_lock_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('publicado','auditado') THEN
    IF NEW.dados_json IS DISTINCT FROM OLD.dados_json
       OR NEW.total_receita_bruta IS DISTINCT FROM OLD.total_receita_bruta
       OR NEW.total_receita_liquida IS DISTINCT FROM OLD.total_receita_liquida
       OR NEW.lucro_bruto IS DISTINCT FROM OLD.lucro_bruto
       OR NEW.ebit IS DISTINCT FROM OLD.ebit
       OR NEW.lair IS DISTINCT FROM OLD.lair
       OR NEW.lucro_liquido IS DISTINCT FROM OLD.lucro_liquido
       OR NEW.periodo_inicio IS DISTINCT FROM OLD.periodo_inicio
       OR NEW.periodo_fim IS DISTINCT FROM OLD.periodo_fim THEN
      RAISE EXCEPTION 'Snapshot publicado é imutável' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dre_snap_lock BEFORE UPDATE ON public.dre_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.dre_snapshot_lock_published();

-- ============================================================================
-- 5) SEED: rubricas padrão (estrutura normativa)
-- ============================================================================
INSERT INTO public.dre_rubricas (codigo, nome, grupo_pai_codigo, tipo, natureza, is_calculada, formula, ordem, editavel_usuario) VALUES
('1', 'RECEITA OPERACIONAL BRUTA', NULL, 'receita_bruta', 'credora', false, NULL, 10, false),
('1.1', 'Receita Bruta de Vendas', '1', 'receita_bruta', 'credora', false, NULL, 11, true),
('1.2', 'Receita Bruta de Serviços', '1', 'receita_bruta', 'credora', false, NULL, 12, true),
('1.3', 'Outras Receitas Operacionais', '1', 'receita_bruta', 'credora', false, NULL, 13, true),
('2', 'DEDUÇÕES DA RECEITA BRUTA', NULL, 'deducao_receita', 'devedora', false, NULL, 20, false),
('2.1', 'Devoluções e Abatimentos', '2', 'deducao_receita', 'devedora', false, NULL, 21, true),
('2.2', 'Impostos sobre Vendas (ISS/ICMS/PIS/COFINS)', '2', 'deducao_receita', 'devedora', false, NULL, 22, true),
('2.3', 'Simples Nacional', '2', 'deducao_receita', 'devedora', false, NULL, 23, true),
('REC_LIQ', 'RECEITA OPERACIONAL LÍQUIDA', NULL, NULL, 'credora', true, 'receita_bruta - deducoes', 29, false),
('3', 'CUSTOS DOS SERVIÇOS/PRODUTOS VENDIDOS', NULL, 'custo_servico', 'devedora', false, NULL, 30, false),
('3.1', 'Custo dos Serviços Prestados (CSV)', '3', 'custo_servico', 'devedora', false, NULL, 31, true),
('3.2', 'Custo das Mercadorias Vendidas (CMV)', '3', 'custo_servico', 'devedora', false, NULL, 32, true),
('3.3', 'Custo Operacional Direto', '3', 'custo_servico', 'devedora', false, NULL, 33, true),
('LUC_BRU', 'LUCRO BRUTO', NULL, NULL, 'credora', true, 'receita_liquida - custos', 39, false),
('4', 'DESPESAS OPERACIONAIS', NULL, NULL, 'devedora', false, NULL, 40, false),
('4.1', 'Despesas com Vendas', '4', 'despesa_vendas', 'devedora', false, NULL, 41, true),
('4.1.1', 'Comissões de Vendas', '4.1', 'despesa_vendas', 'devedora', false, NULL, 42, true),
('4.1.2', 'Marketing e Publicidade', '4.1', 'despesa_vendas', 'devedora', false, NULL, 43, true),
('4.1.3', 'Fretes e Entregas', '4.1', 'despesa_vendas', 'devedora', false, NULL, 44, true),
('4.2', 'Despesas Administrativas', '4', 'despesa_administrativa', 'devedora', false, NULL, 45, true),
('4.2.1', 'Salários e Encargos', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 46, true),
('4.2.2', 'Aluguel e Ocupação', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 47, true),
('4.2.3', 'Serviços de Terceiros / Contabilidade', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 48, true),
('4.2.4', 'Materiais de Escritório', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 49, true),
('4.2.5', 'Tecnologia e Sistemas', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 50, true),
('4.2.6', 'Seguros', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 51, true),
('4.2.7', 'Depreciação e Amortização', '4.2', 'despesa_administrativa', 'devedora', false, NULL, 52, true),
('4.3', 'Outras Despesas Operacionais', '4', 'outras_despesas_op', 'devedora', false, NULL, 53, true),
('5', 'OUTRAS RECEITAS OPERACIONAIS', NULL, 'outras_receitas_op', 'credora', false, NULL, 55, true),
('5.1', 'Receitas Não Recorrentes', '5', 'outras_receitas_op', 'credora', false, NULL, 56, true),
('5.2', 'Recuperação de Despesas', '5', 'outras_receitas_op', 'credora', false, NULL, 57, true),
('EBIT', 'RESULTADO OPERACIONAL (EBIT)', NULL, NULL, 'credora', true, 'lucro_bruto - despesas_op + outras_receitas', 59, false),
('6', 'RESULTADO FINANCEIRO', NULL, NULL, 'credora', false, NULL, 60, false),
('6.1', 'Receitas Financeiras', '6', 'receita_financeira', 'credora', false, NULL, 61, true),
('6.1.1', 'Juros Recebidos / Empréstimos Concedidos', '6.1', 'receita_financeira', 'credora', false, NULL, 62, true),
('6.1.2', 'Rendimentos de Aplicações', '6.1', 'receita_financeira', 'credora', false, NULL, 63, true),
('6.1.3', 'Descontos Obtidos', '6.1', 'receita_financeira', 'credora', false, NULL, 64, true),
('6.2', 'Despesas Financeiras', '6', 'despesa_financeira', 'devedora', false, NULL, 65, true),
('6.2.1', 'Juros Pagos / Empréstimos', '6.2', 'despesa_financeira', 'devedora', false, NULL, 66, true),
('6.2.2', 'IOF e Tarifas Bancárias', '6.2', 'despesa_financeira', 'devedora', false, NULL, 67, true),
('6.2.3', 'Multas e Juros de Mora', '6.2', 'despesa_financeira', 'devedora', false, NULL, 68, true),
('6.2.4', 'Descontos Concedidos', '6.2', 'despesa_financeira', 'devedora', false, NULL, 69, true),
('LAIR', 'RESULTADO ANTES DO IR/CSLL (LAIR)', NULL, NULL, 'credora', true, 'ebit + resultado_financeiro', 70, false),
('7', 'PROVISÃO IRPJ / CSLL', NULL, 'provisao_irpj_csll', 'devedora', false, NULL, 71, false),
('7.1', 'IRPJ', '7', 'provisao_irpj_csll', 'devedora', false, NULL, 72, true),
('7.2', 'CSLL', '7', 'provisao_irpj_csll', 'devedora', false, NULL, 73, true),
('LUCRO_LIQ', 'LUCRO LÍQUIDO DO EXERCÍCIO', NULL, NULL, 'credora', true, 'lair - provisoes', 80, false);

-- ============================================================================
-- 6) FUNÇÃO: dre_generate (gera a DRE completa para o período)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dre_generate(
  _company_id uuid,
  _from date,
  _to date,
  _regime text DEFAULT 'caixa'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rubricas jsonb;
  _tipos jsonb;
  _receita_bruta numeric := 0;
  _deducoes numeric := 0;
  _custos numeric := 0;
  _desp_vendas numeric := 0;
  _desp_admin numeric := 0;
  _outras_desp numeric := 0;
  _outras_rec numeric := 0;
  _rec_fin numeric := 0;
  _desp_fin numeric := 0;
  _provisoes numeric := 0;
  _rec_liq numeric;
  _lucro_bruto numeric;
  _ebit numeric;
  _res_fin numeric;
  _lair numeric;
  _lucro_liq numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_member(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
  END IF;
  IF _regime NOT IN ('caixa','competencia') THEN
    RAISE EXCEPTION 'Regime inválido' USING ERRCODE = '22023';
  END IF;

  -- Agrega por rubrica: soma amount alocado * percentual/100.
  -- caixa: filtro por payment_date; valor = amount_paid (fallback amount).
  -- competencia: filtro por COALESCE(due_date, transaction_date); valor = amount.
  WITH tx AS (
    SELECT
      t.category_id,
      CASE
        WHEN _regime = 'caixa' THEN COALESCE(NULLIF(t.amount_paid,0), t.amount)
        ELSE t.amount
      END AS valor
    FROM public.transactions t
    WHERE t.company_id = _company_id
      AND t.context = 'pj'
      AND t.status <> 'cancelado'
      AND t.transaction_type <> 'transferencia'
      AND (
        (_regime = 'caixa' AND t.payment_date BETWEEN _from AND _to)
        OR (_regime = 'competencia' AND COALESCE(t.due_date, t.transaction_date) BETWEEN _from AND _to)
      )
  ),
  agg AS (
    SELECT m.rubrica_id, SUM(tx.valor * (m.percentual_alocacao/100.0))::numeric(15,2) AS total
    FROM tx
    JOIN public.dre_categoria_mapeamento m
      ON m.categoria_id = tx.category_id AND m.company_id = _company_id
    GROUP BY m.rubrica_id
  ),
  ajustes AS (
    SELECT a.rubrica_id,
           SUM(CASE
             WHEN a.tipo_ajuste = 'adicionar' THEN a.valor
             WHEN a.tipo_ajuste = 'subtrair' THEN -a.valor
             ELSE 0
           END)::numeric(15,2) AS ajuste_valor,
           MAX(CASE WHEN a.tipo_ajuste = 'substituir' THEN a.valor END)::numeric(15,2) AS substituir_valor,
           COUNT(*) AS qt_ajustes
    FROM public.dre_ajustes_manuais a
    WHERE a.company_id = _company_id
      AND a.aprovado_em IS NOT NULL
      AND a.periodo_inicio <= _to AND a.periodo_fim >= _from
    GROUP BY a.rubrica_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'rubrica_id', r.id,
      'codigo', r.codigo,
      'nome', r.nome,
      'grupo_pai_codigo', r.grupo_pai_codigo,
      'tipo', r.tipo,
      'natureza', r.natureza,
      'is_calculada', r.is_calculada,
      'ordem', r.ordem,
      'valor_base', COALESCE(ag.total, 0),
      'ajuste', COALESCE(aj.ajuste_valor, 0),
      'substituir', aj.substituir_valor,
      'qt_ajustes', COALESCE(aj.qt_ajustes, 0),
      'valor', COALESCE(aj.substituir_valor, COALESCE(ag.total, 0) + COALESCE(aj.ajuste_valor, 0))
    ) ORDER BY r.ordem
  )
  INTO _rubricas
  FROM public.dre_rubricas r
  LEFT JOIN agg ag ON ag.rubrica_id = r.id
  LEFT JOIN ajustes aj ON aj.rubrica_id = r.id
  WHERE r.visivel = true;

  -- Totaliza por tipo (para calcular subtotais)
  SELECT
    COALESCE(SUM(CASE WHEN r.tipo = 'receita_bruta' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'deducao_receita' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'custo_servico' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'despesa_vendas' AND r.codigo <> '4.1' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'despesa_administrativa' AND r.codigo NOT IN ('4','4.2') THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'outras_despesas_op' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'outras_receitas_op' AND r.codigo <> '5' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'receita_financeira' AND r.codigo <> '6.1' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'despesa_financeira' AND r.codigo <> '6.2' THEN (item->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN r.tipo = 'provisao_irpj_csll' AND r.codigo <> '7' THEN (item->>'valor')::numeric END), 0)
  INTO _receita_bruta, _deducoes, _custos, _desp_vendas, _desp_admin,
       _outras_desp, _outras_rec, _rec_fin, _desp_fin, _provisoes
  FROM jsonb_array_elements(_rubricas) AS item
  JOIN public.dre_rubricas r ON r.id = (item->>'rubrica_id')::uuid
  WHERE r.is_calculada = false;

  -- Somas dos grupos-cabeçalho (1, 2, 4.1, 4.2, etc.) — para não duplicar quando pai não tem filhos, cabeçalhos com filhos serão exibidos como agregado
  -- Já filtrados acima excluindo cabeçalhos.
  _rec_liq := _receita_bruta - _deducoes;
  _lucro_bruto := _rec_liq - _custos;
  _ebit := _lucro_bruto - (_desp_vendas + _desp_admin + _outras_desp) + _outras_rec;
  _res_fin := _rec_fin - _desp_fin;
  _lair := _ebit + _res_fin;
  _lucro_liq := _lair - _provisoes;

  RETURN jsonb_build_object(
    'company_id', _company_id,
    'periodo_inicio', _from,
    'periodo_fim', _to,
    'regime', _regime,
    'rubricas', _rubricas,
    'totais', jsonb_build_object(
      'receita_bruta', _receita_bruta,
      'deducoes', _deducoes,
      'receita_liquida', _rec_liq,
      'custos', _custos,
      'lucro_bruto', _lucro_bruto,
      'despesas_operacionais', _desp_vendas + _desp_admin + _outras_desp,
      'outras_receitas_operacionais', _outras_rec,
      'ebit', _ebit,
      'receitas_financeiras', _rec_fin,
      'despesas_financeiras', _desp_fin,
      'resultado_financeiro', _res_fin,
      'lair', _lair,
      'provisoes', _provisoes,
      'lucro_liquido', _lucro_liq,
      'margem_bruta_pct', CASE WHEN _rec_liq > 0 THEN ROUND((_lucro_bruto / _rec_liq) * 100, 2) ELSE 0 END,
      'margem_operacional_pct', CASE WHEN _rec_liq > 0 THEN ROUND((_ebit / _rec_liq) * 100, 2) ELSE 0 END,
      'margem_liquida_pct', CASE WHEN _rec_liq > 0 THEN ROUND((_lucro_liq / _rec_liq) * 100, 2) ELSE 0 END
    )
  );
END $$;
REVOKE ALL ON FUNCTION public.dre_generate(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_generate(uuid, date, date, text) TO authenticated;

-- ============================================================================
-- 7) FUNÇÃO: dre_check_consistency — categorias sem mapeamento
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dre_check_consistency(
  _company_id uuid,
  _from date,
  _to date
)
RETURNS TABLE(
  categoria_id uuid,
  categoria_nome text,
  qt_transacoes bigint,
  total numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, COUNT(t.id)::bigint, COALESCE(SUM(t.amount),0)::numeric
    FROM public.transactions t
    JOIN public.categories c ON c.id = t.category_id
    LEFT JOIN public.dre_categoria_mapeamento m
      ON m.categoria_id = c.id AND m.company_id = _company_id
    WHERE t.company_id = _company_id
      AND t.context = 'pj'
      AND t.status <> 'cancelado'
      AND t.transaction_type <> 'transferencia'
      AND COALESCE(t.due_date, t.transaction_date) BETWEEN _from AND _to
      AND m.id IS NULL
    GROUP BY c.id, c.name
    ORDER BY SUM(t.amount) DESC NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.dre_check_consistency(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_check_consistency(uuid, date, date) TO authenticated;

-- ============================================================================
-- 8) FUNÇÃO: dre_apply_default_mapping (heurística por nome)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dre_apply_default_mapping(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inserted int := 0;
  _cat record;
  _rubrica_codigo text;
  _rubrica_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_admin_or_owner(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR _cat IN
    SELECT c.id, c.name, c.transaction_type
    FROM public.categories c
    JOIN public.category_companies cc ON cc.category_id = c.id AND cc.company_id = _company_id
    LEFT JOIN public.dre_categoria_mapeamento m
      ON m.categoria_id = c.id AND m.company_id = _company_id
    WHERE m.id IS NULL
  LOOP
    _rubrica_codigo := CASE
      WHEN _cat.name ILIKE '%vend%' OR _cat.name ILIKE '%venda%' THEN '1.1'
      WHEN _cat.name ILIKE '%servi%' OR _cat.name ILIKE '%repasse%' OR _cat.name ILIKE '%comiss%receb%' THEN '1.2'
      WHEN _cat.name ILIKE '%simples%' THEN '2.3'
      WHEN _cat.name ILIKE '%impost%' OR _cat.name ILIKE '%iss%' OR _cat.name ILIKE '%icms%' OR _cat.name ILIKE '%pis%' OR _cat.name ILIKE '%cofins%' THEN '2.2'
      WHEN _cat.name ILIKE '%comiss%' AND _cat.transaction_type = 'despesa' THEN '4.1.1'
      WHEN _cat.name ILIKE '%market%' OR _cat.name ILIKE '%publicid%' OR _cat.name ILIKE '%anúnc%' OR _cat.name ILIKE '%anunc%' THEN '4.1.2'
      WHEN _cat.name ILIKE '%frete%' OR _cat.name ILIKE '%entreg%' THEN '4.1.3'
      WHEN _cat.name ILIKE '%salári%' OR _cat.name ILIKE '%salar%' OR _cat.name ILIKE '%folha%' OR _cat.name ILIKE '%encarg%' THEN '4.2.1'
      WHEN _cat.name ILIKE '%alug%' OR _cat.name ILIKE '%condom%' THEN '4.2.2'
      WHEN _cat.name ILIKE '%contab%' OR _cat.name ILIKE '%terceir%' OR _cat.name ILIKE '%consult%' THEN '4.2.3'
      WHEN _cat.name ILIKE '%escrit%' OR _cat.name ILIKE '%material%' THEN '4.2.4'
      WHEN _cat.name ILIKE '%tecno%' OR _cat.name ILIKE '%sistema%' OR _cat.name ILIKE '%software%' OR _cat.name ILIKE '%saas%' THEN '4.2.5'
      WHEN _cat.name ILIKE '%seguro%' THEN '4.2.6'
      WHEN _cat.name ILIKE '%deprec%' OR _cat.name ILIKE '%amortiz%' THEN '4.2.7'
      WHEN _cat.name ILIKE '%administ%' THEN '4.2'
      WHEN _cat.name ILIKE '%juros%receb%' OR _cat.name ILIKE '%emprést%conced%' OR _cat.name ILIKE '%emprest%conced%' THEN '6.1.1'
      WHEN _cat.name ILIKE '%rendim%' OR _cat.name ILIKE '%aplicaç%' OR _cat.name ILIKE '%aplicac%' THEN '6.1.2'
      WHEN _cat.name ILIKE '%desconto%obt%' THEN '6.1.3'
      WHEN _cat.name ILIKE '%juros%pag%' OR _cat.name ILIKE '%emprést%' OR _cat.name ILIKE '%emprest%' THEN '6.2.1'
      WHEN _cat.name ILIKE '%iof%' OR _cat.name ILIKE '%tarifa%' OR _cat.name ILIKE '%banc%' THEN '6.2.2'
      WHEN _cat.name ILIKE '%multa%' OR _cat.name ILIKE '%mora%' THEN '6.2.3'
      WHEN _cat.name ILIKE '%desconto%conced%' THEN '6.2.4'
      WHEN _cat.name ILIKE '%irpj%' THEN '7.1'
      WHEN _cat.name ILIKE '%csll%' THEN '7.2'
      WHEN _cat.name ILIKE '%operacion%' AND _cat.transaction_type = 'despesa' THEN '3.3'
      WHEN _cat.transaction_type = 'receita' THEN '1.3'
      WHEN _cat.transaction_type = 'despesa' THEN '4.3'
      ELSE NULL
    END;

    IF _rubrica_codigo IS NULL THEN CONTINUE; END IF;
    SELECT id INTO _rubrica_id FROM public.dre_rubricas WHERE codigo = _rubrica_codigo;
    IF _rubrica_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.dre_categoria_mapeamento (company_id, categoria_id, rubrica_id, percentual_alocacao, created_by)
    VALUES (_company_id, _cat.id, _rubrica_id, 100, _uid)
    ON CONFLICT (company_id, categoria_id, rubrica_id) DO NOTHING;

    _inserted := _inserted + 1;
  END LOOP;

  RETURN _inserted;
END $$;
REVOKE ALL ON FUNCTION public.dre_apply_default_mapping(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_apply_default_mapping(uuid) TO authenticated;

-- ============================================================================
-- 9) FUNÇÃO: dre_publish_snapshot
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dre_publish_snapshot(
  _company_id uuid,
  _from date,
  _to date,
  _titulo text,
  _tipo_periodo text DEFAULT 'personalizado',
  _regime text DEFAULT 'caixa',
  _observacoes text DEFAULT NULL,
  _publicar boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _dre jsonb;
  _tot jsonb;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_admin_or_owner(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  _dre := public.dre_generate(_company_id, _from, _to, _regime);
  _tot := _dre->'totais';

  INSERT INTO public.dre_snapshots (
    company_id, titulo, periodo_inicio, periodo_fim, tipo_periodo, regime, status,
    dados_json, total_receita_bruta, total_receita_liquida, lucro_bruto, ebit, lair, lucro_liquido,
    observacoes, gerado_por, publicado_por, publicado_em
  ) VALUES (
    _company_id, _titulo, _from, _to, _tipo_periodo, _regime,
    CASE WHEN _publicar THEN 'publicado' ELSE 'rascunho' END,
    _dre,
    (_tot->>'receita_bruta')::numeric,
    (_tot->>'receita_liquida')::numeric,
    (_tot->>'lucro_bruto')::numeric,
    (_tot->>'ebit')::numeric,
    (_tot->>'lair')::numeric,
    (_tot->>'lucro_liquido')::numeric,
    _observacoes, _uid,
    CASE WHEN _publicar THEN _uid ELSE NULL END,
    CASE WHEN _publicar THEN now() ELSE NULL END
  ) RETURNING id INTO _id;

  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.dre_publish_snapshot(uuid, date, date, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_publish_snapshot(uuid, date, date, text, text, text, text, boolean) TO authenticated;

-- ============================================================================
-- 10) FUNÇÃO: dre_ultimo_snapshot (para Plin IA)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dre_ultimo_snapshot(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _snap public.dre_snapshots;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_member(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _snap FROM public.dre_snapshots
   WHERE company_id = _company_id AND status IN ('publicado','auditado')
   ORDER BY periodo_fim DESC, publicado_em DESC LIMIT 1;
  IF _snap.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', _snap.id,
    'titulo', _snap.titulo,
    'periodo_inicio', _snap.periodo_inicio,
    'periodo_fim', _snap.periodo_fim,
    'receita_bruta', _snap.total_receita_bruta,
    'receita_liquida', _snap.total_receita_liquida,
    'lucro_bruto', _snap.lucro_bruto,
    'ebit', _snap.ebit,
    'lair', _snap.lair,
    'lucro_liquido', _snap.lucro_liquido,
    'totais', _snap.dados_json->'totais'
  );
END $$;
REVOKE ALL ON FUNCTION public.dre_ultimo_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dre_ultimo_snapshot(uuid) TO authenticated;
