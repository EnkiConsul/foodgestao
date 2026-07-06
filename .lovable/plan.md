
## Objetivo
Adicionar o módulo **DRE Contábil** ao Gestor Plin, exclusivo para contexto **PJ** (empresas), integrado às `categories` e `transactions` existentes, seguindo Lei 6.404/76, ITG 1000/2022 e CPC 26 (R1).

Escopo: entrega única com backend + telas + exportação + integração com Plin IA.

---

## 1. Backend (migração única)

**Tabelas novas (schema `public`):**

- `dre_rubricas` — catálogo global de rubricas contábeis (seed com toda a árvore normativa; código, nome, tipo, natureza credora/devedora, `is_calculada`, `formula`, `ordem`, `editavel_usuario`, `visivel`). Leitura para `authenticated`, escrita restrita a `super_admin`.
- `dre_categoria_mapeamento` — vínculo `company_id + categoria_id → rubrica_id` com `percentual_alocacao` (permite dividir 1 categoria em até N rubricas somando 100%). RLS: membros da empresa leem; `owner`/`admin` escrevem.
- `dre_ajustes_manuais` — ajustes por `company_id + rubrica_id + período`, `tipo_ajuste` (adicionar/subtrair/substituir), fluxo de aprovação (`aprovado_por`, `aprovado_em`). RLS: membros leem; `owner`/`admin` criam; só `owner` aprova.
- `dre_snapshots` — snapshot imutável (`dados_json`) da DRE publicada por período, com totais denormalizados (receita bruta/líquida, lucro bruto, EBIT, LAIR, lucro líquido). RLS: membros leem; `owner`/`admin` publicam.

**Grants:** `SELECT/INSERT/UPDATE/DELETE` para `authenticated` conforme políticas, `ALL` para `service_role`. Índices em `(categoria_id)`, `(rubrica_id)`, `(company_id, periodo_inicio, periodo_fim)`.

**Funções (SECURITY DEFINER, `EXECUTE` só para `authenticated`):**

- `dre_generate(_company_id uuid, _from date, _to date, _regime text)` → retorna JSON com árvore hierárquica de rubricas + valores agregados + totais calculados (Receita Líquida, Lucro Bruto, EBIT, LAIR, Lucro Líquido). Uma única query com `JOIN transactions ⋈ dre_categoria_mapeamento ⋈ dre_rubricas`, respeitando `is_company_member`. Regime `caixa` filtra por `payment_date` (status confirmado); `competência` por `due_date`.
- `dre_apply_default_mapping(_company_id uuid)` — sugere mapeamento por nome de categoria (heurística de string) para categorias sem vínculo.
- `dre_check_consistency(_company_id, _from, _to)` — retorna lista de categorias/lançamentos sem mapeamento no período.
- `dre_publish_snapshot(_company_id, _from, _to, _titulo, _observacoes)` — chama `dre_generate`, grava snapshot imutável com totais denormalizados.

**Seed:** insere ~35 rubricas da estrutura normativa (RECEITA BRUTA → LUCRO LÍQUIDO), incluindo linhas calculadas (`REC_LIQ`, `LUC_BRU`, `EBIT`, `LAIR`, `LUCRO_LIQ`).

---

## 2. Frontend

**Rotas novas em `src/App.tsx`:**

```text
/relatorios/dre                  → geração/visualização
/relatorios/dre/configuracao     → mapeamento categorias ↔ rubricas
/relatorios/dre/rubricas         → gestão de rubricas (super_admin)
/relatorios/dre/historico        → lista de snapshots
/relatorios/dre/historico/:id    → visualização de snapshot publicado
```

Todas exigem contexto **PJ** ativo (se PF, banner "Módulo disponível apenas no perfil empresarial").

**Componentes (`src/components/dre/`):**
- `DREReport.tsx` — tabela hierárquica com colunas Valor / % Rec. Líquida / Comparativo período anterior / Variação %.
- `DRELine.tsx`, `DRESubtotal.tsx` — linhas com indentação por nível de código.
- `DREIndicators.tsx` — cards de Margem Bruta, Margem Operacional, Margem Líquida, EBITDA, Índice Inadimplência.
- `CategoryMappingPanel.tsx` + `RubricaTree.tsx` — mapeamento com filtro "Não mapeadas", divisão percentual, botão "Aplicar mapeamento padrão".
- `ManualAdjustModal.tsx` — criação/aprovação de ajustes.
- `DREExportButton.tsx` — PDF (via `jspdf` + `jspdf-autotable`, já no projeto de relatórios), Excel (`xlsx`), CSV.
- `DREConsistencyBanner.tsx` — avisos de categorias/lançamentos não mapeados.

**Hooks (`src/hooks/`):**
- `useDREGeneration.ts` — chama RPC `dre_generate` com filtros (período, regime, comparativo).
- `useDREMapping.ts` — CRUD do mapeamento + heurística default.
- `useDRESnapshots.ts` — lista/publica/lê snapshots.
- `useDRERubricas.ts` — árvore de rubricas.

**Menu:** adicionar submenu "DRE" em `AppSidebar.tsx` sob "Relatórios" (só aparece no contexto PJ).

**Permissões (mapeamento acordado):**
- `owner` + `admin` da empresa = admin/manager (mapeamento, ajustes, publicação; aprovação de ajustes só `owner`).
- `member` = operator (só visualiza e exporta).
- `viewer` = só visualiza.
- Edição de rubricas globais = `super_admin`.
- Enforcement no backend (RLS + funções) e na UI (esconder ações).

---

## 3. Integração Plin IA

Estender `supabase/functions/_shared/plin-ia-context.ts`:
- No contexto PJ, buscar último snapshot publicado da empresa ativa e injetar `dre_ultimo_periodo` no `contextToText`.
- Adicionar tool `plin_ia_dre_summary(_company_id)` no `ai-financial-agent` para o LLM consultar sob demanda a última DRE.
- Novas quick prompts em `src/pages/PlinIA.tsx`: "Como está minha margem operacional?", "Analise minha última DRE", "Onde estou perdendo mais dinheiro?".

---

## 4. Validações e alertas
- Banner no topo do relatório quando há categorias sem mapeamento.
- Aviso se `Receita Bruta = 0` ou `Deduções > Receita Bruta`.
- Destaque vermelho quando `Lucro Líquido < 0` (Prejuízo do Exercício).
- Snapshots publicados são imutáveis (trigger que impede UPDATE em `dados_json` e totais quando `status = 'publicado'`).

---

## Detalhes técnicos
- Valores em `NUMERIC(15,2)`; formatação BRL via `formatBRL` já existente.
- Query de geração otimizada (single `SELECT` com CTE agregando por rubrica).
- Snapshot armazena JSON completo — republicação gera nova versão.
- Trigger de auditoria em `dre_ajustes_manuais` (INSERT/UPDATE/APROVAÇÃO) via `insert_audit_log`.
- Zod schemas em `src/lib/validations.ts` para ajustes e snapshot.

---

## Ordem de execução
1. Migração SQL (tabelas + RLS + grants + seed rubricas + funções RPC + triggers).
2. Types regenerados automaticamente.
3. Hooks + páginas + componentes DRE.
4. Rota, sidebar, guard PJ.
5. Extensão Plin IA (context + tool + quick prompts).
6. Verificação: build, screenshot da tela `/relatorios/dre` via Playwright.

Após aprovar, começo pela migração (que precisa da sua aprovação separada) e sigo com o restante em sequência.
