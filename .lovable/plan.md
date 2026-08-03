# Fase 1 — Diagnóstico do modelo de categorias (Food Service V2)

## 1. Resumo executivo

O catálogo padrão atual tem **68 registros** em `category_templates` (o comentário de "69 templates" está desatualizado em 1). Ele é genérico, organiza receita por **forma de pagamento**, mistura mão de obra operacional com administrativa e não possui perdas, marketplaces, taxas de cartão nem separação patrimonial. Não há versionamento, não há campos de exemplos/keywords para IA, e **nada impede lançamento em categoria agrupadora**.

O risco de dados é **baixo agora e alto depois**: só **3 empresas** (de 12) têm categorias semeadas, **350** lançamentos no total, **0** lançamentos em agrupadoras, **0** em categorias de forma de pagamento e apenas **1** transferência (sem categoria). Ou seja, esta é a melhor janela possível para trocar o modelo.

## 2. Escopo auditado

Repositório do projeto (branch de trabalho, commit `1b992fd1`, sem alterações não commitadas), 315 migrations, funções/triggers de categorias e plano de contas, e consultas somente leitura no banco vinculado. Nenhuma alteração foi feita.

## 3. Schema atual (real, confirmado no banco)

`category_templates`: `code, parent_code, name, level, sort_order, subtype, transaction_type, ai_description, previous_index, is_customizable, chart_account_code, created_at`.

`categories`: `id, user_id, company_id, parent_id, name, icon, color, context, transaction_type, is_system, sort_order, hierarchy_index, visible_pf, chart_account_id, template_code, category_subtype, ai_description, previous_index, is_customizable, is_active`.

Enum real de `transaction_type`: `entrada, saida, transferencia, parcelamento` — o template só usa `entrada` e `saida`.

Não existem: `allow_transactions`, `is_synthetic` em categorias, `updated_at` nem `template_version` no template, e nada de `user_description`, `included_examples`, `excluded_examples`, `ai_keywords`.

## 4. Inventário do template atual

- 68 registros; profundidade máxima 4; 0 `parent_code` inexistente; 0 órfãs; 0 códigos duplicados.
- Por tipo/subtipo: entrada/receita 13; saída/custo 10; saída/despesa 32; saída/imposto 8; saída/investimento 4; saída/saida 1.
- `ai_description`: 68 preenchidas (0 vazias).
- `chart_account_code`: apenas **1** preenchido (`Receitas Operacionais → 4.6`); **67 sem conta contábil**.
- Não customizáveis: 2.
- Códigos são opacos (`CAT000001`...), sem semântica hierárquica.

## 5. Inventário das empresas

- 12 empresas; **3** com categorias semeadas; 9 sem categorias.
- 452 registros em `categories`, dos quais **248 com `company_id` nulo** (base legada/PF anterior ao multiempresa) — ponto de atenção.
- 0 categorias personalizadas (`template_code` nulo); **3** renomeadas em relação ao template.
- **428** sem conta contábil vinculada; **197** sem vínculo em `category_companies`.
- 350 lançamentos: 5 sem categoria, 0 em categoria inativa, 0 em agrupadora, 0 em categoria de forma de pagamento, 1 transferência sem categoria.

## 6. Fluxos que consomem categorias

`src/pages/Categorias.tsx`, `CategoryFormDialog.tsx`, `CategoryRow.tsx`, `src/pages/admin/CategoriasPadrao.tsx`, `src/lib/categories/{display,tree,chartCompat}.ts`, `src/lib/transactions/formHelpers.ts`, `TransactionFormDialog.tsx`, `ConciliacaoPluggy.tsx`, orçamento, DRE/relatórios contábeis, `useCategorizationSuggestion.ts` e as funções de IA. No banco: `seed_default_categories`, `seed_default_categories_on_company`, `category_templates_apply_chart_accounts`, `category_templates_validate_chart_account`, `categories_guard_parent_company`, `categories_require_subtype`, `guard_transaction_category_active`, `categorize_transaction(s)`, `chart_accounts_*`.

## 7. Divergências encontradas — P0 / P1 / P2

**P0**
1. Agrupadoras aceitam lançamento: não existe `allow_transactions`/`is_synthetic`; `buildCategoryTree` não desabilita pais e nenhuma trigger bloqueia — só `guard_transaction_category_active` (inatividade).
2. `chartCompat.ts` e `category_templates_validate_chart_account` bloqueiam grupos 1–3, então **investimento não pode usar Ativo**, aporte não pode usar PL e empréstimo não pode usar Passivo. A regra é baseada só no primeiro dígito.
3. Categorias patrimoniais (aporte, empréstimo, amortização, distribuição de lucros) hoje entram como receita/despesa e contaminam a DRE.
4. 248 categorias sem `company_id` num sistema multiempresa.

**P1**
5. Sem versionamento do template: qualquer alteração é destrutiva para o próximo cadastro e não há registro de qual versão cada empresa recebeu.
6. Receita por forma de pagamento duplica dimensão já existente (`payment_method_id`, `account_id`, `credit_card_id`) e impede leitura por canal de venda.
7. 67 de 68 templates sem conta contábil → DRE depende de mapeamento manual por empresa.
8. Ausência de CMV detalhado, perdas/desperdícios, marketplaces, taxas de cartão e separação de mão de obra direta vs. administrativa.
9. Transferência: o seletor de categoria continua aparecendo e aceita categoria de receita/despesa.
10. Ausência de `user_description`, exemplos incluídos/excluídos e keywords — a IA decide quase só por similaridade textual.

**P2**
11. `previous_index`/`hierarchy_index` conviverem com `sort_order` sem fonte única.
12. Códigos opacos `CAT00000x` dificultam manutenção e diff entre versões.
13. Sem `updated_at` no template, sem auditoria de quem alterou.

## 8. Comparação com Food Service V2 e matriz de migração

- Estrutura-alvo: 3 raízes (ENTRADAS, SAÍDAS, TRANSFERÊNCIAS), ~18 grupos de saída e ~200 analíticas — contra 68 hoje.
- **Manter/renomear/mover**: receitas financeiras, impostos, CPV (vira CMV Alimentos/Bebidas/Embalagens), ocupação, administrativas, marketing, veículos, despesas financeiras.
- **Dividir**: "Salários e Ordenados" → cozinha / salão / delivery / administrativo (nunca automático; exige centro de custo ou confirmação).
- **Descontinuar como legado** (`is_active=false`, marcado como legado, nunca excluído): Receitas PIX/Dinheiro/Cartão Crédito/Cartão Débito.
- **Criar novo**: canais de venda, receitas complementares, perdas e desperdícios, despesas variáveis de venda, mão de obra direta, serviços operacionais diretos, investimentos, sócios, patrimoniais, transferências.
- Como só 3 empresas têm categorias e nenhuma tem lançamento nas categorias afetadas, o risco real de reclassificação é próximo de zero — mas o fluxo de upgrade deve ser controlado de qualquer forma.

## 9. Arquitetura proposta (Fase 2)

- `category_template_releases` (`template_key, version, status draft/published/deprecated, content_hash, snapshot jsonb, published_at, published_by`), versão publicada imutável.
- `company_category_template_versions` para registrar a versão aplicada por empresa (permite histórico e múltiplos templates).
- Novos campos em `category_templates` e espelho em `categories`: `user_description`, `included_examples[]`, `excluded_examples[]`, `ai_keywords[]`, `ai_excluded_keywords[]`, `expected_counterparty_types[]`, `expected_payment_contexts[]`, `allow_transactions`, `requires_review`, `default_is_active`, `template_version`, `updated_at` — com CHECKs de tamanho/quantidade e normalização de espaços.
- Nova coluna de comportamento: `result_behavior` (`receita, custo, despesa, imposto, investimento, movimento_patrimonial, distribuicao, transferencia, controle`) como base da nova matriz contábil, substituindo a regra do primeiro dígito.
- `chartCompat.ts` reescrito a partir dessa matriz (investimento→Ativo, aporte→PL, empréstimo→Passivo, amortização→baixa de Passivo, juros→despesa financeira, transferência→sem resultado).
- Trigger de bloqueio de lançamento em categoria com `allow_transactions = false`, aplicada também a RPCs, importação e Open Finance.

## 10. Migrations futuras propostas

1. Colunas novas em `category_templates` + `categories` (nullable, idempotente).
2. `category_template_releases` + `company_category_template_versions` com GRANTs e RLS super-admin.
3. `allow_transactions` + trigger de bloqueio + backfill (`false` para quem tem filhos).
4. Nova matriz de compatibilidade contábil (função + reescrita da validação).
5. Seed do template Food Service V2 como release `draft`, sem tocar no catálogo vigente.
6. `seed_default_categories` versionada e RPC de upgrade controlado por empresa, preservando personalizações.
7. Marcação legada das categorias por forma de pagamento.

## 11. Arquivos a alterar nas próximas fases

`src/pages/admin/CategoriasPadrao.tsx`, `src/pages/Categorias.tsx`, `src/components/categories/*`, `src/lib/categories/{chartCompat,display,tree}.ts`, `src/lib/transactions/formHelpers.ts`, `src/components/transactions/TransactionFormDialog.tsx`, `src/pages/ConciliacaoPluggy.tsx`, `src/hooks/useCategorizationSuggestion.ts`, funções de IA e uma nova tela de comparação/upgrade de versão.

## 12. Plano de testes

- **Banco**: criação e publicação imutável de versão; seed idempotente; upgrade preservando personalização; bloqueio de agrupadora; matriz contábil por comportamento; RLS entre empresas; concorrência; rollback.
- **Frontend**: árvore, busca, agrupadora desabilitada, textos de ajuda e exemplos, responsividade mobile, loading/erro, comparação entre versões.
- **IA**: alimentos, bebidas, marketplace, taxa de cartão, antecipação, entregador CLT vs. motoboy terceirizado, investimento, aporte, empréstimo, transferência, perda de estoque, bonificação, conflito de sinais, baixa confiança, categoria inativa, isolamento entre empresas.

## 13. Riscos e rollback

Riscos principais: divisão de salários sem centro de custo; reclassificação de histórico; empresas com upgrade interrompido pela metade; quebra da DRE ao mudar o vínculo contábil. Mitigação: release imutável, upgrade transacional por empresa, legado preservado, nada de reclassificação automática.

Rollback da Fase 1: **não aplicável, pois nenhuma alteração foi realizada.** Para as próximas fases: despublicar a versão sem apagar dados, reverter colunas nullable, restaurar o template anterior pelo snapshot e manter o histórico intacto.

## 14. Recomendação para a Fase 2

Começar pela **fundação técnica**: colunas novas, `category_template_releases`, `allow_transactions` com trigger e a nova matriz de comportamento contábil — sem cadastrar ainda o Food Service V2 e sem tocar nas empresas existentes. Só depois cadastrar o V2 como `draft` (Fase 3).

---

Fase 1 concluída apenas como diagnóstico. Nenhuma alteração foi realizada. Aguardando aprovação para iniciar a Fase 2.
