## Diagnóstico (verificado no banco)

As categorias da **Raptor Systems** estão corretas: 23 vinculadas, 14 já com conta contábil, 82 dos 91 lançamentos com categoria mapeada.

O bloqueio é o plano de contas:
- Vínculos de contas contábeis com a Raptor (`chart_account_companies`): **0**. A ClicSorte, do mesmo dono, tem **100**.
- As 11 contas usadas pelas categorias da Raptor (4.2, 4.4, 5.3, 5.4, 6.1.1 Aluguel, 6.1.3, 6.1.5, 6.1.6, 6.1.7, 6.1.10, 8.1 Simples Nacional) estão vinculadas **somente à ClicSorte**.

A RPC do DRE monta a árvore a partir das contas vinculadas à empresa selecionada; com zero vínculos, o relatório vem vazio.

**Causa raiz sistêmica:** o plano de contas é criado por usuário e vinculado por empresa. Quando o dono cria a **segunda** empresa, ele já tem plano de contas, o seed não roda e nenhum vínculo é criado — a nova empresa nasce sem plano de contas. Isso vai se repetir com todo cliente multi-empresa.

## Plano — tornar isso padrão em todo o sistema

### 1. Garantia automática de plano de contas por empresa
- Ajustar a rotina executada na criação de empresa para sempre terminar com a empresa tendo plano de contas:
  - dono sem plano de contas → roda o seed padrão e vincula;
  - dono já com plano de contas → vincula as contas existentes à nova empresa.
- Mesma garantia para o contexto Pessoa Física (hoje sem plano de contas nenhum, então o DRE em PF é sempre vazio).

### 2. Rede de segurança no servidor
- Criar uma função "garantir plano de contas da empresa" idempotente, chamada tanto na criação da empresa quanto no início do DRE/Contas Contábeis. Se faltarem vínculos, ela cria antes de responder — nenhum cliente vê relatório vazio por falta de vínculo.

### 3. Correção retroativa da base atual
- Rodar uma normalização única sobre todas as empresas existentes sem contas vinculadas (Raptor Systems e as demais no mesmo estado), criando os vínculos a partir do plano do dono ou do seed padrão.

### 4. Estado vazio e pendências no relatório
- Em `/relatorios/contabeis`, se ainda assim não houver contas vinculadas, exibir aviso claro com ação "Criar/vincular plano de contas" em vez de tabela em branco.
- Exibir contador de categorias sem conta contábil (ex.: 9 na Raptor) com link direto para concluir o mapeamento em Contas Contábeis.

### 5. Mapeamento padrão categoria → conta
- Ação em lote em Contas Contábeis para aplicar o mapeamento padrão por tipo (receita/despesa) nas categorias ainda sem conta, revisável pelo usuário — para novos clientes já entrarem com o DRE funcionando.

## Detalhes técnicos
- RPC `chart_accounts_report`: a CTE `accs` exige `EXISTS (chart_account_companies WHERE company_id = _company_id)` — é aí que o resultado zera.
- Reaproveitar/ajustar `chart_accounts_seed_on_company`, `chart_accounts_seed_default`, `dre_apply_default_mapping`; nova função idempotente `chart_accounts_ensure_for_company`.
- Front-end: `src/pages/relatorios/Contabeis.tsx`, `src/hooks/useContabeisReport.tsx`, `src/pages/ContasContabeis.tsx`.
- Sem alterações no motor de saldos, nos lançamentos ou nas categorias já mapeadas.
