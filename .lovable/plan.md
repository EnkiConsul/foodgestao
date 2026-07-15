# Document access-control rules

Update the security memory document (`security--update_memory`) to record the invariants for two sensitive tables so future scans and edits don't reintroduce exposure.

## What to add

### CNPJ cache (`public.cnpj_cache`)
- Server-only table. Populated and read exclusively by the `lookup-cnpj` edge function using `service_role`.
- No `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants to `anon` or `authenticated`.
- No RLS policy should expose rows to authenticated users (no `USING (true)`).
- If client-side lookup is ever needed, it must go through an edge function, not direct table access.

### Payroll entries (`public.dp_folha_lancamentos`)
- Access model:
  - Company owners, admins and members: full visibility via `is_company_member` / `is_company_admin_or_owner`.
  - Super admins: full visibility via `is_super_admin`.
  - Colaboradores (employees): can view **only their own** lines (`dc.user_id = auth.uid()`) and **only** when `status IN ('aprovado_dp', 'aprovado_financeiro', 'pago')`.
- Invariant: draft/pending statuses (anything outside the approved-or-paid set) must never be visible to the colaborador role. Any new value added to the `dp_folha_lancamento_status` enum must be explicitly reviewed against this policy before being added to the allowlist.
- Writes remain restricted to company admins/owners and super admins.

## Deliverable

A single `security--update_memory` call that merges these rules into the existing security memory (keeping any current content about the app's access model, and removing stale entries about these two tables if present). No code or schema changes.
