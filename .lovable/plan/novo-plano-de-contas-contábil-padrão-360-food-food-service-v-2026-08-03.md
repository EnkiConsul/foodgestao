# Novo plano de contas contábil padrão 360°FOOD (Food Service V2)

Substituir o modelo global de contas contábeis (hoje 135 contas) pela árvore completa do documento — 9 grupos, ~350 contas, com contas sintéticas, analíticas, dinâmicas e redutoras — e acrescentar os campos de orientação que dizem, em linguagem simples, quais categorias devem ser vinculadas a cada conta. Esses mesmos campos alimentam o agente de IA que passa a sugerir a conta contábil de cada categoria automaticamente.

Empresas já existentes não são alteradas: o novo modelo vale para novas empresas e para quem clicar em "Restaurar Modelo" em Contas Contábeis. Os grupos opcionais/internos (5.8 Apuração Simplificada do CMV e 9.7 Controles Técnicos Internos) entram no modelo, criados inativos.

## O que muda para o usuário

**Backoffice — Contas Contábeis Padrão**
- Árvore nova completa: 1 Ativo, 2 Passivo, 3 Patrimônio Líquido, 4 Receitas, 5 Custos, 6 Despesas Operacionais, 7 Despesas Financeiras, 8 Impostos e Tributos, 9 Contas de Controle/Conciliação/Exceção.
- Cada conta ganha campos de orientação no formulário:
  - **Como usar esta conta** (texto simples).
  - **Categorias que devem vir para cá** e **Categorias que NÃO devem vir para cá** (exemplos).
  - **Palavras-chave** e **palavras-chave de exclusão**.
  - **Tipos de categoria aceitos** (receita, custo, despesa, imposto, investimento, patrimonial, transferência) e **tipos de movimento aceitos** (entrada, saída, transferência).
  - **Exige revisão humana** (para contas de controle e casos ambíguos).
  - Marcadores de conta sintética, analítica, dinâmica e redutora.
- Badges na árvore indicando [S] sintética, [A] analítica, [D] dinâmica, [C] redutora, inativa e "exige revisão".

**Categorias Padrão**
- O seletor de conta contábil passa a filtrar pelos tipos aceitos declarados na conta, mostrando a orientação da conta ao lado.
- Botão **Sugerir contas com IA**: para as categorias sem conta vinculada, o agente propõe a conta contábil, com justificativa e nível de confiança; o admin revisa e aplica em lote ou item a item. Casos ambíguos (bonificação, ativo x manutenção, aporte x receita, sócio, transferência entre empresas) vêm marcados como "revisar".

**Empresa (tela Contas Contábeis)**
- "Restaurar Modelo" passa a trazer as contas novas que faltam, preservando contas próprias, renomeações, vínculos e histórico. Nada é excluído.
- Contas sintéticas continuam desabilitadas nos seletores; contas inativas e as de controle marcadas como internas ficam fora de novos lançamentos.

## Impacto na DRE e nas categorias

Os códigos mudam de posição (ex.: CMV de Alimentos passa a 5.1, Despesas Variáveis de Venda passa a 6.2, Marketing passa a 6.5). Para não quebrar nada:

- Cada conta do template recebe uma **chave estável** (`template_key`, ex.: `expense.variable.marketplace_commission`). Categorias, DRE e IA passam a usar a chave, não o código visual.
- Os 140 vínculos atuais de `category_templates.chart_account_code` são remapeados por matriz de correspondência para os códigos novos na mesma migração.
- O mapeamento das linhas da DRE gerencial (Receita Bruta → Margem Bruta → Margem após Prime Cost → Margem de Contribuição → EBITDA → Resultado Líquido) e o indicador **Prime Cost** passam a ser definidos por grupo/chave, não pelo primeiro dígito.

## Detalhes técnicos

1. **Migração de schema** em `public.chart_account_templates`: `template_key` (único), `template_version`, `usage_description`, `included_category_examples text[]`, `excluded_category_examples text[]`, `keywords text[]`, `excluded_keywords text[]`, `allowed_category_subtypes text[]`, `allowed_transaction_types text[]`, `required_context`, `requires_review`, `is_dynamic`, `is_reducer`, `is_active`, `dre_line`. Espelhar `template_key`, `usage_description`, `keywords`, `allowed_*`, `requires_review`, `is_dynamic`, `is_reducer` em `public.chart_accounts` para que a orientação viaje para a empresa.
2. **Seed do novo modelo**: migração que limpa `chart_account_templates` e insere a árvore completa do documento com código, pai, nome, descrição, orientação, exemplos, keywords, tipos aceitos, flags e `template_key`. 5.8 e 9.7 entram com `is_active = false`.
3. **Remapeamento**: matriz `codigo_antigo → template_key` aplicada em `category_templates.chart_account_code`; contas de empresa existentes recebem `template_key` quando houver correspondência (nenhuma exclusão, nenhuma renumeração forçada).
4. **Compatibilidade**: `src/lib/categories/chartCompat.ts` e o trigger `category_templates_validate_chart_account` passam a validar por `allowed_category_subtypes`/`allowed_transaction_types` da conta, com fallback nas regras atuais de raiz; contas sintéticas e inativas continuam bloqueadas.
5. **Seeder de empresa**: `chart_accounts_seed_default` / `chart_accounts_ensure` / `chart_accounts_restore_default` passam a semear a partir do novo template e a casar contas por `template_key` (aditivo, idempotente, com auditoria em `audit_logs`).
6. **Agente de IA**: Edge Function `suggest-chart-account` (Lovable AI) recebe categoria (nome, subtipo, tipo, keywords, orientações) + candidatas analíticas/ativas com suas orientações e devolve `template_key`, confiança, justificativa e `requires_review`. Chamada em lote pelo backoffice; RPC de aplicação registra auditoria.
7. **Frontend**: `src/pages/admin/ContasContabeisPadrao.tsx` e `ChartAccountFormDialog.tsx` ganham os campos novos (textos, chips de keywords, multi-select de tipos aceitos, switches); `src/pages/admin/CategoriasPadrao.tsx` ganha o botão de sugestão por IA com painel de revisão; `src/pages/ContasContabeis.tsx` exibe os novos badges.
8. **DRE**: `src/lib/relatorios/dre.ts` e `chart_accounts_report` passam a agrupar por `dre_line`, incluindo Margem após Prime Cost e o indicador Prime Cost.
9. **Testes**: unitários da árvore (unicidade de código e `template_key`, sintética sem lançamento, redutoras), da compatibilidade categoria×conta, do remapeamento e do DRE novo (Margem Bruta, Prime Cost, EBITDA, Resultado Líquido).

## Ordem de execução

Schema + chave estável → seed da nova árvore → remapeamento dos vínculos → compatibilidade e seeder de empresa → backoffice e formulários → agente de IA → DRE e testes.
