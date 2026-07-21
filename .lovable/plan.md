
# Diagnóstico encontrado

## Tabelas associativas em `public`
- `category_companies` — FK + UNIQUE ok
- `contact_companies` — FK + UNIQUE ok
- `payment_method_companies` — FK + UNIQUE ok
- `chart_account_companies` — FK + UNIQUE ok
- `company_invites`, `company_members`, `company_modules` — não são "associativas de cadastro", fora do escopo

## Vulnerabilidades atuais nas policies

**CRÍTICO — payment_method_companies**
```
FOR ALL USING/WITH CHECK
  EXISTS (SELECT 1 FROM payment_methods pm WHERE pm.id = payment_method_id AND pm.user_id = auth.uid())
```
Roles = `public`. Sem qualquer verificação de `company_id` ou membership. Qualquer dono da forma de pagamento vincula/desvincula em qualquer empresa cujo UUID conheça.

**CRÍTICO — chart_account_companies**
Mesmo padrão do payment_method_companies (FOR ALL, público, só valida dono).

**CRÍTICO — category_companies**
```
SELECT: is_company_member(uid, company_id) OR user_owns_category(uid, category_id)
INSERT/DELETE: member_can_edit(uid, company_id, 'categorias') OR user_owns_category(uid, category_id)
```
O `OR user_owns_category(...)` derruba a autorização por empresa. Criador removido continua com poder total.

**CRÍTICO — contact_companies**
Mesmo padrão de `category_companies` com `user_owns_contact` e módulo `'contatos'`.

## Divergência de nomes de módulos
- Policies atuais usam PT: `'categorias'`, `'contatos'`.
- Frontend usa EN: `categories`, `contacts`, `payment_methods`.
- `private.member_permission` retorna `'edit'` para owner/admin sempre, e para `member` faz `COALESCE(permissions->>_module,'edit')` — como `company_members.permissions` está NULL em todos os registros hoje, a divergência não bloqueia acesso na prática, mas é bomba-relógio.

## Funções de autorização existentes
`private.is_company_member`, `private.member_permission`, `private.member_can_edit`, `private.is_company_admin_or_owner` — corretas, SECURITY DEFINER, search_path setado. Vou **reutilizá-las** e adicionar dois wrappers explícitos exigidos pela spec (`can_view_company_module`, `can_edit_company_module`) que também tratam super_admin.

## Grants atuais
Apenas `sandbox_exec` aparece (o usuário psql). Vou reafirmar `GRANT SELECT, INSERT, DELETE TO authenticated` e `REVOKE ALL FROM anon` explicitamente em todas as 4 tabelas.

## Duplicidades
Zero duplicatas em category/contact/payment. Constraints UNIQUE já existem em todas as 4 tabelas.

## Riscos
1. Renomear módulos `categorias→categories` / `contatos→contacts` sem migrar `company_members.permissions` pode revogar acesso de members. **Mitigação**: como todas as linhas atuais têm `permissions IS NULL`, é seguro renomear agora; adicionamos backfill defensivo.
2. Cortar o fallback `user_owns_*` pode quebrar telas que criam categoria/contato em PF e depois vinculam a PJ. **Mitigação**: em PF puro não existe `company_id` — o vínculo só existe em PJ, e para PJ o usuário sempre é membro.
3. `chart_account_companies` está fora do escopo original mas tem exatamente a mesma falha; incluo por consistência (módulo `chart_accounts`).

---

# Plano de execução

## Migration 01 — Funções canônicas de autorização
- Criar `private.can_view_company_module(_uid, _company_id, _module text)` e `private.can_edit_company_module(...)` incluindo `is_super_admin`.
- `SET search_path = ''`, qualificação total, `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`.

## Migration 02 — `category_companies` RLS
- Drop das 3 policies antigas.
- SELECT: `can_view_company_module(uid, company_id, 'categories')`.
- INSERT: `can_edit_company_module(uid, company_id, 'categories') AND EXISTS(categories WHERE id=category_id AND (context IS NULL OR context='pj'))`.
- DELETE: `can_edit_company_module(uid, company_id, 'categories')`.
- `REVOKE UPDATE`; sem policy de UPDATE.
- `REVOKE ALL FROM anon`; `GRANT SELECT, INSERT, DELETE TO authenticated`; `GRANT ALL TO service_role`.
- Índices por `company_id` e `category_id` (idempotente).

## Migration 03 — `contact_companies` RLS
Mesmo padrão com módulo `'contacts'` e validação de existência do contato + `visible_pj/context`.

## Migration 04 — `payment_method_companies` RLS
- Drop policy `FOR ALL` insegura.
- SELECT / INSERT / DELETE separados usando módulo `'payment_methods'`.
- Sem UPDATE. Grants e revokes.

## Migration 05 — `chart_account_companies` RLS
Mesmo padrão, módulo `'chart_accounts'`.

## Migration 06 — Trigger de integridade cross-tenant
- `private.prevent_association_tenant_change()`: em UPDATE, bloqueia mudança de `company_id` e da coluna da entidade (`category_id`/`contact_id`/`payment_method_id`/`chart_account_id`). Super_admin pode.
- Aplicar em `BEFORE UPDATE` nas 4 tabelas.

## Migration 07 — Security-lint SQL (view diagnóstica)
- Criar `private.rls_associative_audit` view listando policies que ainda contenham `user_id = auth.uid()` em tabelas `%_companies`. Consultada pelo `scripts/security-lint.mjs`.

## Testes RLS (`src/test/rls/`)
- `category_companies.rls.test.ts` — anônimo bloqueado em SELECT/INSERT/DELETE (rede-limitada, sem fixture).
- `contact_companies.rls.test.ts` — idem.
- `payment_method_companies.rls.test.ts` — idem.
- `chart_account_companies.rls.test.ts` — idem.
- Testes autenticados A/B/C/D com fixtures reais serão adicionados como scaffold em `src/test/tenancy/associative_rls.tenancy.test.ts`, seguindo o padrão de `multi_company.tenancy.test.ts` (gated por env de credenciais). Sem `if(!fixture)return` — se fixture faltar, `throw`.

## Security-lint script
Adicionar em `scripts/security-lint.mjs` regra que reprova PRs com padrão `user_owns_(category|contact)` ou `\.user_id\s*=\s*auth\.uid\(\)` dentro de policies de tabelas `%_companies` em migrations novas.

## Frontend
Nenhuma mudança funcional: o app já opera sob autorização por empresa. Vou apenas validar `TransactionFormDialog`, `CategoriaForm`, `ContatoForm` e `FormaPagamentoForm` para garantir que enviam `company_id` correto no insert do vínculo (já enviam).

---

# Critérios de aceite (verificação final)
Executarei ao término:
- `psql` — confirmar policies novas e ausência das antigas nas 4 tabelas.
- `npm test` — 20+ testes RLS passando.
- `tsgo` — sem regressão de tipos.
- Build automático do harness.
- Rodar `supabase--linter` para verificar warnings.

# Formato de relatório final
Ao final de cada bloco reporto: Migration criada / Policies removidas / Policies criadas / Grants ajustados / Constraints / Testes / Resultado.

Aprovar para iniciar pela Migration 01?
