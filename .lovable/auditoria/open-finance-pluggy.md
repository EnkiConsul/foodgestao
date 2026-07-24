# Auditoria — Integração Open Finance Pluggy (Bloco 1)

Documento produzido antes de qualquer migration/código. Cobre o §5, §6 e itens correlatos do **PROMPT DEFINITIVO**. Nada será alterado nas funções existentes sem evidência concreta e aprovação explícita.

## 1. Escopo e ambientes

- Backend: Supabase (Lovable Cloud) — todas as tabelas em `public` já usam RLS.
- Frontend: Vite + React (SPA). Nada de secrets client-side. Fica proibido qualquer `VITE_PLUGGY_*`.
- Multiempresa: `context_type` PF/PJ já em uso; a integração é **exclusivamente `pj`** com `company_id` obrigatório. `financialScope` (`src/lib/financialScope.ts`) já filtra pesquisas financeiras por empresa — reutilizar.

## 2. Tabelas base já existentes (não recriar)

| Tabela | Papel na integração |
|---|---|
| `accounts` | Conta bancária local. Ligada a `open_finance_accounts.local_account_id` para BANK. |
| `credit_cards` | Cartão local (entidade própria — Fase 9.2). Ligado a `open_finance_accounts.local_credit_card_id`. |
| `credit_card_invoices` | Faturas locais. Alimentadas por Bills Pluggy quando disponíveis; senão pelo motor de ciclo. |
| `transactions` | Lançamentos ativos. Recebe colunas adicionais (§16 do prompt). |
| `categories` / `categorization_rules` / `import_rules` | Pipeline de categorização — reutilizar sem duplicar. |
| `audit_logs` (particionado) | Auditoria de conexão/desconexão/override de snapshot. |
| `companies` / `company_members` | Fonte de autorização para todas as ações Pluggy. |

## 3. Funções financeiras existentes — escopo e veredicto

Referências:
- SQL: `supabase/migrations/20260713223027_*.sql` (`recompute_account_balance`, `get_balance_before`)
- SQL: `supabase/migrations/20260702201559_*.sql` (`dre_generate`, `dre_publish_snapshot`)
- SQL: `supabase/migrations/20260720185019_*.sql` (`pay_credit_card_invoice`)
- TS: `src/lib/transactions/balance.ts` (`signedEffect`, `belongsToRegime`, `runningBalance`)
- TS: `src/lib/relatorios/fluxoCaixa.ts`
- TS: `src/lib/credit-card/cycle.ts`

### 3.1 `recompute_account_balance(_account_id uuid)`

- **Arquivo:** `supabase/migrations/20260713223027_...sql`
- **Escopo:** POR CONTA.
- **Comportamento esperado:** somar entradas (receita/transferência de destino) e subtrair saídas (despesa/transferência de origem) da conta específica.
- **Comportamento atual:** debita `account_id` como saída e credita `destination_account_id` como entrada em transferências — é a semântica correta por-conta.
- **Coerente com escopo?** Sim.
- **Alteração necessária:** **nenhuma**. A nova ingestão OF deverá disparar `recompute_account_balance` para cada conta local afetada por lote (§7 do prompt), sem tocar na função.

### 3.2 `get_balance_before(_user_id, _context, _company_id, _before_date)`

- **Arquivo:** `supabase/migrations/20260713223027_...sql` (assinatura atual)
- **Escopo:** CONSOLIDADO (todas as contas do usuário/empresa até uma data).
- **Comportamento atual:** transferências entre contas próprias produzem impacto líquido zero no consolidado (a saída na origem cancela a entrada no destino).
- **Coerente com escopo?** Sim — é exatamente o que se espera do consolidado.
- **Alteração necessária:** **nenhuma**. A integração precisa que transferências promovidas (`transaction_type='transferencia'`) continuem líquidas zero aqui; isso já ocorre porque `signedEffect` de transferências é `0` (ver §3.4).

### 3.3 `dre_generate(_company_id, _from, _to, _regime)` e `dre_publish_snapshot(...)`

- **Arquivo:** `supabase/migrations/20260702201559_...sql`
- **Escopo:** CONSOLIDADO da empresa.
- **Comportamento atual:** já ignora transferências e pagamentos de fatura na competência (não conta em dobro). NÃO possui hoje filtro por `exclude_from_results` porque essa coluna ainda não existe.
- **Coerente com escopo?** Sim, para o modelo atual.
- **Alteração necessária:** **sim, no Bloco 2/8** — adicionar filtro `AND coalesce(t.exclude_from_results, false) = false` em todas as CTEs de fonte, e:
  - Em `dre_publish_snapshot`, antes do INSERT do snapshot, contar movimentos com `exclude_from_results = true` no período; sem override explícito de owner/admin, retornar erro estruturado (§34). Persistir `publication_override*` + `provisional_movements_count` no registro do snapshot e em `audit_logs`.
- Evidência da divergência: `exclude_from_results` inexistente em `information_schema.columns` da tabela `transactions` (será adicionado no Bloco 2 §16).
- Teste que comprova (a criar): §45 "Snapshot com movimentações provisórias → publicação bloqueada sem override → publicação com override auditada".

### 3.4 `signedEffect` / `belongsToRegime` / `runningBalance` (TS)

- **Arquivo:** `src/lib/transactions/balance.ts` (linhas 80-125).
- **Escopo:** CONSOLIDADO no cliente/relatórios (extrato, fluxo de caixa, DRE frontend).
- **Comportamento atual:**
  - `signedEffect`: receita `+amount`, despesa `-amount`, transferência `0`. Líquido zero no consolidado — correto.
  - `belongsToRegime`: caixa ignora compras de cartão; competência ignora `is_invoice_payment`. Já protege contra dupla contagem.
- **Coerente com escopo?** Sim.
- **Alteração necessária:** **nenhuma na função**. O Bloco 8 vai filtrar `exclude_from_results` **antes** de chamar essas funções (na leitura, em `runningBalance`/`computePeriodTotals` os call-sites farão o filtro) — as funções permanecem intactas.

### 3.5 `src/lib/relatorios/fluxoCaixa.ts`

- **Escopo:** CONSOLIDADO.
- **Comportamento atual:** projeção de fluxo agregando por competência.
- **Alteração necessária:** aplicar `exclude_from_results=false` no filtro de origem quando o Bloco 8 introduzir a coluna. A função em si não muda; apenas o predicado de seleção.

### 3.6 `pay_credit_card_invoice(...)`

- **Arquivo:** `supabase/migrations/20260720185019_...sql`
- **Escopo:** POR CARTÃO / POR FATURA.
- **Comportamento atual:** cria/atualiza a transação de pagamento com `is_invoice_payment=true` e vincula `credit_card_invoice_id`, sem duplicar despesa (a compra original já foi contabilizada).
- **Alteração necessária:** **nenhuma**. A ingestão OF, ao detectar pagamento de fatura (§25), reaproveita esta RPC.

### 3.7 `enqueue_uncategorized_for_ai(...)`

- **Uso atual:** `src/pages/Lancamentos.tsx:190`.
- **Alteração necessária:** **nenhuma** — o Bloco 9 fará enqueue após ingestão OF, no mesmo formato.

### 3.8 `src/lib/credit-card/cycle.ts`

- **Uso atual:** deriva `close_date`/`due_date`/competência dado o cartão.
- **Alteração necessária:** **nenhuma**. Será fallback quando Bills não estiverem disponíveis (§24).

## 4. RLS existente relevante

- `transactions`: RLS por `company_id`/`user_id` via `applyFinancialScope`. As novas colunas §16 herdam a RLS.
- `accounts`, `credit_cards`, `credit_card_invoices`: RLS já validada em testes (`src/test/rls`, `src/test/tenancy`).
- Tabelas novas nascerão com RLS restritiva (§42): staging e webhook events só para `service_role`; conexões/contas OF legíveis por membros autorizados; escritas por perfis com permissão financeira.

## 5. Módulos, planos e permissões

- Módulos ativos por empresa vivem em `company_modules` / `modulos_catalogo`. A conexão Pluggy vai requerer módulo "Open Finance" (a ser catalogado no Bloco 2).
- Plano/limite: `plans` já expõe caps; a checagem de "limite de conexões" (§18) usará um novo campo `plans.open_finance_max_connections`.
- Permissão granular: reuso de `useCompanyPermissions` para `finance_manage`.

## 6. Riscos identificados e mitigação

| Risco | Mitigação |
|---|---|
| Restaurar por engano status de transação cancelada por consolidação de transferência | RPC `ingest_of_transaction` com CTE `WHERE status <> 'cancelado' OR cancel_reason IS DISTINCT FROM 'Consolidado em transferência entre contas próprias'` no `DO UPDATE SET`. |
| Duas pernas gerarem duas linhas ativas na mesma sync | Candidato entra com `pairing_status='waiting'` + `exclude_from_results=true`; ao encontrar par, `promote_to_transfer` faz UPDATE (mesmo `transactions.id`) e cancela/ignora a segunda perna. |
| Snapshot publicado incompleto | `dre_publish_snapshot` bloqueia sem override, persiste override auditado. |
| Vazamento cross-tenant | `connected_by_user_id` só para auditoria; toda checagem de acesso lê `company_members` no momento da ação. |
| Secrets vazando em logs | `_shared/pluggy-client.ts` seguirá o padrão de `_shared/zapi.ts` (`safeError`). |

## 7. Itens que a integração NÃO vai tocar

- `recompute_account_balance` (por conta).
- `get_balance_before` (consolidado).
- `signedEffect` / `belongsToRegime` / `runningBalance`.
- `pay_credit_card_invoice`.
- `enqueue_uncategorized_for_ai`.
- `src/lib/credit-card/cycle.ts`.
- `src/lib/relatorios/fluxoCaixa.ts` (apenas o predicado de origem nos call-sites).

## 8. O que muda funcionalmente (preview do Bloco 2+)

- Novas tabelas §9-§15 do prompt (7 tabelas OF).
- Colunas adicionais em `transactions` (§16) — retro-compatíveis (todas nullable/default).
- Novo predicado `exclude_from_results=false` nas fontes da DRE e relatórios consolidados.
- Novos GRANTs restritos: staging e webhook apenas `service_role`.

## 9. Gate para o próximo bloco

Bloco 2 só inicia após o usuário aprovar este documento. Depois disso:
1. Migration única cria as 7 tabelas OF + colunas em `transactions` + índices únicos + RLS + GRANTs + RPCs (`claim_open_finance_sync`, `release_open_finance_sync`, `ingest_of_transaction`, `promote_to_transfer`, `pair_retro_transfers`, `expire_transfer_candidates`).
2. Ajuste cirúrgico em `dre_generate` e `dre_publish_snapshot` para respeitar `exclude_from_results` e bloquear publicação com provisórios.
3. Nada de código de aplicação ainda — o Bloco 3 (cliente Pluggy + Edge Functions) é o próximo passo depois de tipos regenerados.

---

**Status:** Bloco 1 concluído. Aguardando confirmação para iniciar Bloco 2 (banco + RLS + RPCs).
