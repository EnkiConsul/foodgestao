# P0 — Security hardening (módulo financeiro, preparação para 200 clientes)

Data: 2026-09-15 · Escopo: permissões de execução de funções, grants de tabela,
testes de RLS/Realtime e gates de segurança. Nenhum dado de produção alterado.

## 1. Situação anterior

- 42 funções `SECURITY DEFINER` no schema `public` eram executáveis por
  `anon`/`PUBLIC` (o gate contava 63 findings críticos no total, incluindo
  desdobramentos por grantee).
- Tabelas financeiras tinham GRANT para `anon`; a única barreira era o RLS.
- O gate crítico não distinguia exposição intencional (site público) de
  exposição perigosa.

## 2. Funções auditadas e decisão

Todas as 42 funções expostas foram inspecionadas. Nenhuma pertencia a fluxo
realmente anônimo (login, recuperação, landing, webhook, OAuth, páginas legais) —
esses fluxos usam Edge Functions e `service_role`, não RPC anônima. Todas já
tinham `SET search_path = public` explícito (mantido).

### (c) service_role/internal only — revogado de `anon` e de `authenticated`

Funções de gatilho (não são chamáveis como RPC; o gatilho continua funcionando
porque a permissão é verificada na criação do gatilho) e rotinas internas:

`companies_guard_owner_transfer`, `credit_cards_purge_open_finance`,
`dp_apoio_unidades_guard`, `dp_colaborador_validar_setor`,
`dp_config_dia_validar_setor`, `dp_feriado_validar`,
`dp_folga_limite_setor_validar`, `dp_setores_validar_unidade`,
`dp_ocorrencia_tipos_seed_on_company`, `dp_ocorrencia_tipos_seed`,
`dp_refresh_document_pending`, `pluggy_mark_duplicate_staging`,
`purge_open_finance_link`.

### (b) authenticated — revogado de `anon`/`PUBLIC`, mantido para logados

As 29 restantes são RPCs usadas pelas telas do produto e derivam identidade e
autorização internamente (Fases 1–8 do Pessoas 360°): `credit_card_other_company`,
`dp_colaborador_horario_ocupado`, `dp_feriados_resolver`, `dp_folga_atribuir_admin`,
`dp_folga_autoatribuir_aplicar`, `dp_folga_marcadas_no_mes`, `dp_folga_marcar`,
`dp_folga_ocupado_no_dia`, `dp_folga_remover`, `dp_ocorrencia_*` (analisar,
cancelar, classificar, complementar, config, confirmar, previsto, registrar,
tratar), `dp_pessoa_apoio_upsert`, `dp_pessoa_avulsa_salvar`,
`dp_setor_previsto`, `dp_setor_previsto_id`, `dp_setor_previsto_periodo`,
`dp_solicitacao_cancelar`, `dp_solicitacao_criar`, `dp_solicitacao_criar_admin`,
`dp_solicitacao_responder`, `insert_audit_log`, `is_company_admin_or_owner`.

### (a) deve permanecer pública

Nenhuma. A allowlist de funções anônimas em `scripts/security-lint.mjs` fica
vazia por design, com os critérios de inclusão documentados no próprio arquivo.

### (d) mover para schema privado — P0.2

As ~299 funções `SECURITY DEFINER` executáveis por `authenticated` continuam
como aviso (não bloqueante). Candidatas naturais a `private.` em fase posterior:
helpers de autorização (`has_role`, `is_company_admin_or_owner`,
`dp_colaborador_of`), rotinas de saldo (`adjust_account_balance`,
`apply_tx_balance`) e rotinas de Open Finance (`ignore_open_finance_raw`,
`claim_open_finance_sync`).

## 3. Mudanças aplicadas

Versionadas em `supabase/migrations/20260915013500_p0_security_hardening_grants.sql`
(idempotente; só permissões, sem INSERT/UPDATE/DELETE em dados reais).

1. `REVOKE ALL ... FROM anon, PUBLIC` nas 42 funções; `GRANT EXECUTE` a
   `authenticated` apenas nas do grupo (b); `service_role` em todas.
2. `REVOKE ALL ON TABLE ... FROM anon` nas tabelas financeiras e correlatas:
   `accounts`, `transactions`, `credit_cards`, `credit_card_invoices`,
   `pluggy_connections`, `pluggy_accounts`, `pluggy_v2_connections`,
   `pluggy_v2_accounts`, `pluggy_v2_sync_runs`, `pluggy_v2_transactions_raw`,
   `pluggy_v2_transactions_raw_archive`, `pluggy_staging_transactions`,
   `invoices`, `subscriptions`, `subscription_cards`,
   `subscription_cycle_events`, `transaction_attachments`, `transaction_tags`,
   `transaction_origin_changes`, `balance_drift_snapshots`.
   Realtime respeita RLS **e** grants, então a inscrição anônima passa a ser
   fechada em duas camadas.
3. `scripts/security-lint.mjs`: allowlist documentada de funções anônimas
   (vazia) + dois novos checks críticos — `anon_grants_financeiro` e
   `realtime_financeiro_anon`.
4. `scripts/policy-sweep.mjs`: allowlist documentada de exposição anônima
   intencional (`landing_content`, `mkt_site_settings`).
5. Novo teste `src/test/rls/anon_financeiro.rls.test.ts` (32 casos).

Nenhuma alteração de layout, produto visual, regra de negócio ou dado.

## 4. Riscos remanescentes

- ~299 funções `SECURITY DEFINER` acessíveis a `authenticated` (aviso) — P0.2.
- `mkt_site_settings` e `landing_content` seguem legíveis sem login: é o
  conteúdo do site público, sem dado de cliente.
- Avisos antigos de policies duplicadas e `USING (true)` para `authenticated`
  permanecem catalogados no policy-sweep.
- 5 tabelas com policies para `authenticated` sem GRANT correspondente
  (`auth_login_identifiers`, `auth_rate_limits`, `auth_recovery_challenges`,
  `cnpj_cache`, `dp_cargos`) — intencional: são lidas por rotinas internas.

## 5. Como testar

```bash
bunx vitest run src/test/rls src/test/tenancy   # RLS, isolamento e Realtime
node scripts/security-lint.mjs --ci             # 0 críticos esperados
node scripts/policy-sweep.mjs                   # 0 críticos esperados
bunx vite build
```

## 6. Próximos passos (P0.2)

1. Mover helpers e rotinas sensíveis de `public` para `private`, expondo só o
   que a API precisa.
2. Revisar as ~299 funções `authenticated` por domínio (financeiro primeiro).
3. Eliminar policies duplicadas e `USING (true)` remanescentes.
4. Prova de carga/tenancy com 200 empresas simuladas.

## Continuação

A fase P0.2-A (funções financeiras executáveis por `authenticated`) está documentada em
[`p0-2a-finance-functions-hardening.md`](./p0-2a-finance-functions-hardening.md) e versionada em
`supabase/migrations/20260915020000_p02a_finance_functions_hardening.sql`.

- P0.2-B: rotinas de teste/E2E (`_e2e_*`/`_test_*`) protegidas por guarda explícita — ver [p0-2b-test-functions-hardening.md](./p0-2b-test-functions-hardening.md).

> Continuação: [P0.2-C — rotinas de QA somente com service_role](./p0-2c-qa-functions-service-role.md)

> Continuação: [P0.3 — rotinas de QA fora do schema público](./p0-3-qa-functions-private-schema.md)
