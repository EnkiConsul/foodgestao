# Fase 1 — Multiempresa, Isolamento e RLS

## 1. Diagnóstico (verificado no banco)

### Estado atual das RLS (findings principais)
| Tabela | Policy atual | Diagnóstico |
|---|---|---|
| `transactions` | separada em SELECT/INSERT/UPDATE/DELETE via `is_company_member` + `member_can_edit` | **OK** — RLS já isola por empresa |
| `accounts` | idem `transactions` | **OK** |
| `credit_cards` | `is_company_member` / `member_can_edit` | **OK** |
| `bank_connections` | `user_id = auth.uid()` **OR** `is_company_member` | OK (dupla via) |
| `budgets` | `USING (auth.uid() = user_id)` (ALL, role `public`) | **QUEBRADO** — sem `company_id`, membros não veem entre si |
| `categories` | `USING (auth.uid() = user_id)` (ALL, `public`) | **QUEBRADO** para PJ; hoje "salva" pela RPC `get_accessible_categories` + tabela `category_companies` |
| `contacts` | `USING (auth.uid() = user_id)` (ALL, `public`) | **QUEBRADO** para PJ |
| `payment_methods` | `USING (auth.uid() = user_id)` | **QUEBRADO** para PJ |
| `cost_centers` | `USING (auth.uid() = user_id)` | **QUEBRADO** para PJ |
| `transaction_attachments` | `USING (auth.uid() = user_id)` + SELECT company via EXISTS | Escrita não colaborativa entre membros |

Funções em `private` já existem: `is_company_member`, `is_company_admin_or_owner`, `member_can_edit` (retorna bool para módulo). Faltam: `can_view_module`, `can_edit_module` explícitas por módulo já cobertas por `member_can_edit`.

### Estado atual do frontend
Filtro por `user_id` está aplicado em consultas PJ em (verificado): `Dashboard.tsx:89`, `Lancamentos.tsx:332`, `FluxoCaixa.tsx:95`, `Relatorios.tsx:157`, `Orcamento.tsx:47,65`, `Categorias.tsx` (4x), `Contatos.tsx:50`, `FormasPagamento.tsx:32`, `ContasContabeis.tsx:66`, `ContasBancarias`, `useTransactionFormLookups.ts:55`, `ImportStatementDialog.tsx` (2x), `Relatorios.tsx:123`. Todos precisam da mesma normalização: PF filtra `user_id + company_id IS NULL`; PJ filtra apenas `company_id`.

### Estado dos dados
- `transactions`: 251 registros, **0 inconsistências** (PJ sem company_id: 0; PF com company_id: 0)
- `budgets`: **0 registros** — migração pode adicionar `company_id` sem risco de backfill
- Constraint de coerência (context ↔ company_id) ausente em todas as tabelas

### Causa raiz
1. Frontend fixa `.eq("user_id", user.id)` mesmo em PJ, então membros só enxergam o que criaram, ainda que a RLS permita ver o resto.
2. `budgets`, `categories`, `contacts`, `payment_methods`, `cost_centers` têm policy única `auth.uid() = user_id` → membros ficam bloqueados pela RLS.
3. `budgets` não tem `company_id`.

## 2. Escopo (o que muda / o que NÃO muda)

Escopo estritamente restrito às Etapas 1–19 do briefing. **Não** vamos: mexer em módulo DP, IA, cobrança, landing, planos, Pluggy (além de garantir `company_id` já persistido), remover `user_id`, refatorar UI.

## 3. Plano por blocos (migrations + código, cada bloco = uma entrega revisável)

### Bloco A — Helper de escopo financeiro (frontend, zero risco)
- Criar `src/lib/financialScope.ts` com `FinancialScope`, `assertFinancialScope`, `applyFinancialScope(query, scope)`.
- Uso obrigatório: PF → `user_id + context='pf' + company_id IS NULL`; PJ → `company_id + context='pj'` (sem `user_id`).
- Adicionar teste unitário do helper em `src/lib/financialScope.test.ts`.

### Bloco B — Frontend: unificar consultas financeiras
Substituir `.eq("user_id", …)` por `applyFinancialScope` nos seguintes arquivos (apenas leitura/agregação; mutações mantêm `user_id` como autor):
- `src/pages/Dashboard.tsx`
- `src/pages/Lancamentos.tsx` (fetch principal, listas auxiliares, RPCs)
- `src/pages/FluxoCaixa.tsx`
- `src/pages/Relatorios.tsx` (transações + lookups de contatos)
- `src/pages/Orcamento.tsx` (budgets + spending)
- `src/pages/Categorias.tsx`, `Contatos.tsx`, `FormasPagamento.tsx`, `ContasContabeis.tsx`, `ContasBancarias.tsx`, `CartoesCredito.tsx`
- `src/hooks/useTransactionFormLookups.ts`
- `src/components/transactions/ImportStatementDialog.tsx`
- `src/components/budgets/BudgetFormDialog.tsx`
- `src/components/transactions/TransactionFormDialog.tsx` (lookups)

Cache keys do React Query recebem `contextType + selectedCompanyId` (já parcialmente feito).

### Bloco C — CompanyContext hardening
- Em `useCompanyContext.tsx`: validar `selectedCompanyId` contra lista carregada; se inválido, limpar `localStorage` e selecionar a primeira acessível.
- No `setContext`, invalidar caches financeiros: `queryClient.removeQueries({ predicate: q => financialKeys.includes(q.queryKey[0]) })`.
- Bloquear render de páginas PJ enquanto `contextType==='pj' && !selectedCompanyId`.

### Bloco D — Permissões na UI
- Envolver botões de criar/editar/excluir em Dashboard/Lançamentos/Orçamento/Contas/Categorias/Contatos/Cartões com `useCompanyPermissions().can(module, 'edit')`.
- Rotas com `none` → redirect (usar wrapper existente ou criar `RequireModuleAccess`).

### Bloco E — Migration: `budgets.company_id` + RLS
```sql
-- 1. Coluna + FK + índices
ALTER TABLE public.budgets
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
CREATE INDEX idx_budgets_company_id ON public.budgets(company_id);
CREATE INDEX idx_budgets_company_context ON public.budgets(company_id, context);

-- 2. Constraint de coerência (0 linhas hoje, seguro sem NOT VALID)
ALTER TABLE public.budgets ADD CONSTRAINT budgets_context_company_check
  CHECK ((context='pf' AND company_id IS NULL) OR (context='pj' AND company_id IS NOT NULL));

-- 3. Substituir policy única por SELECT/INSERT/UPDATE/DELETE espelhando transactions
DROP POLICY "Users can manage own budgets" ON public.budgets;
-- SELECT: PF próprio OR PJ member OR super_admin
-- INSERT/UPDATE/DELETE: PF próprio OR PJ member_can_edit(company_id,'budgets')
```
Rollback: `DROP CONSTRAINT`, `DROP COLUMN`, recriar policy antiga.

### Bloco F — Migration: RLS colaborativa em `categories`, `contacts`, `payment_methods`, `cost_centers`, `transaction_attachments`
Padrão idêntico ao `accounts`:
- SELECT: PF próprio (`user_id=auth.uid() AND company_id IS NULL`) OR PJ via `is_company_member` (para categorias/contatos/payment_methods usar `category_companies`/`contact_companies`/`payment_method_companies` como junção) OR super_admin
- INSERT/UPDATE/DELETE via `member_can_edit(company_id, <module>)`.
- `transaction_attachments`: autorização derivada da transação (SELECT e escrita).

Rollback documentado: recriar policy antiga `USING (auth.uid()=user_id)`.

### Bloco G — Trigger anti-cross-tenant
Trigger `BEFORE INSERT OR UPDATE` em `transactions` validando que `account_id`, `destination_account_id`, `category_id`, `contact_id`, `payment_method_id`, `credit_card_id`, `cost_center_id` compartilham `company_id` (ou pertencem ao usuário em PF). Bloquear troca de `company_id`/`context` no UPDATE (já parcialmente coberto pela policy — reforço defensivo).

### Bloco H — Security lint
Adicionar checks em `scripts/security-lint.mjs`:
- policy PJ que use somente `user_id = auth.uid()`
- tabela com `context` sem CHECK de coerência
- policy `USING (true)` ou `USING (auth.uid() = user_id)` em tabela com `company_id`

### Bloco I — Testes
- Unit: `financialScope.test.ts` (matriz PF/PJ, ausência de companyId em PJ deve lançar).
- Regressão (Vitest + supabase-js contra ambiente TEST_*): criar `src/test/tenancy/` com 4 usuários (A/B/C owner/member/viewer da Empresa 1, D owner Empresa 2) cobrindo os cenários da Etapa 13. Rodam somente quando `TEST_SUPABASE_URL` está setado; caso contrário `describe.skip`.

### Bloco J — CI
Adicionar `npm run typecheck:strict && npm run lint && npm run test && npm run build && npm run security-lint -- --ci` no workflow atual (já existe base). Não incluir testes de tenancy sem as vars.

## 4. Ordem de entrega e rollback
1. Bloco A (helper) — sem impacto em produção.
2. Bloco B (frontend consultas) — atrás de flag mental: se algo quebrar, `git revert`.
3. Bloco C (contexto) + D (UI perms).
4. Migration E (budgets) — segura (0 registros).
5. Migration F (RLS colaborativa) — a mais sensível; validar antes com `EXPLAIN` que a RPC `get_accessible_categories` continua funcional.
6. Migration G (trigger cross-tenant).
7. Bloco H + I + J.

Cada migration inclui bloco `-- ROLLBACK` comentado.

## 5. Riscos de compatibilidade
- **Categorias/Contatos/Payment methods**: hoje muitos são criados sem `company_id` mesmo em PJ (usa junção `*_companies`). A nova RLS precisa contemplar ambos os modelos: dono (`user_id`) OU vínculo por junção. Se ignorarmos, membros que criam categoria dentro do PJ podem perder a categoria ao trocar de contexto. **Ação:** durante Bloco F, validar via `supabase--read_query` como a app está criando esses registros hoje antes de fechar a policy.
- **RPCs de relatórios** (`chart_accounts_report`, `dre_generate`, etc.) — auditar internamente que validam membership; se não, adicionar `if not private.is_company_member(auth.uid(), _company_id) then raise`.
- **Realtime**: canais atuais já filtram por `company_id`; nenhum ajuste necessário além dos caches.

## 6. Aprovação
Solicito aprovação para executar do **Bloco A ao Bloco D** (frontend + helper + UI perms, sem migrations). Migrations (E/F/G) e testes (I) entrariam em turnos separados para revisão granular.
