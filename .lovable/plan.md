## Diagnóstico

Consultei o estado real no banco para a conexão Santander Empresas:

- `bank_connection_accounts.auto_import = true` ✅
- `bank_connection_accounts.provider_balance = 83.34` ✅ (saldo atualiza)
- `bank_connection_accounts.last_synced_at = NULL` ⚠️
- `bank_connection_accounts.last_synced_tx_date = NULL` ⚠️
- `transactions` para essa conta: **0** ⚠️
- Últimos eventos em `pluggy_webhook_events`: só `connector/status_updated` (o webhook novo ainda não entregou eventos de transação).

O campo `last_synced_at` do lado da conta é gravado exatamente ao final do loop de transações em `pluggy-sync-connection` (linhas 154-160). Estar `NULL` significa que **o loop de importação nunca terminou com sucesso para essa conta** desde que o `auto_import` foi ligado — apesar do saldo estar aparecendo (o saldo é atualizado antes do gate de `auto_import`, então ele "atualiza saldo" mesmo sem importar lançamentos).

## Hipóteses a confirmar (nesta ordem)

1. **Sync não está sendo re-disparado após ligar auto_import.** A UI pode estar apenas re-lendo `bank_connection_accounts` (o saldo cacheado permanece), sem chamar `pluggy-sync-connection`.
2. **Pluggy ainda não coletou transações para o item.** Se o `connect_token` original não incluiu o produto `TRANSACTIONS` ou o item foi criado só com `ACCOUNTS`, `/transactions?accountId=...` retorna `results: []` mesmo com saldo ok. (No `_shared/pluggy.ts` linha 82 já pedimos `["ACCOUNTS","TRANSACTIONS","IDENTITY"]`, mas itens criados antes dessa configuração podem não ter.)
3. **Erro silencioso no `pluggy_upsert_transaction`.** O `console.error("upsert tx", ...)` está no código mas os logs da function só mostram "booted" — pode ser que a function não esteja sendo chamada, ou os erros estão sendo swallowed no `continue`.

## Passos do plano

### Passo 1 — Reproduzir e capturar

- Disparar `pluggy-sync-connection` manualmente para a conexão via `supabase--curl_edge_functions` autenticando como o usuário, com `fullResync: true` para forçar janela ampla (ignora `last_synced_tx_date`).
- Ler `supabase--edge_function_logs` para `pluggy-sync-connection` filtrando pela invocação, e conferir:
  - se `listTransactions` foi chamado,
  - quantos `results` voltaram na primeira página,
  - se algum `upsert tx` foi logado como erro.

### Passo 2 — Corrigir conforme o achado

- **Se `results` = 0** (Pluggy sem transações coletadas): recriar/reforçar o item na Pluggy pedindo produto `TRANSACTIONS` — pode exigir reconectar a conta pelo widget. Documento passo-a-passo.
- **Se `upsert tx` falha** (RPC `pluggy_upsert_transaction` rejeita algo): ler a definição da RPC, corrigir constraint/validação, adicionar melhor logging no catch.
- **Se a function nem foi chamada** ao "Sincronizar": corrigir o handler do botão em `OpenFinanceSection`/`usePluggy` para invocar `functions.invoke('pluggy-sync-connection')` corretamente e propagar o retorno.

### Passo 3 — Melhorias de observabilidade e UX (independente do achado)

Todas em `supabase/functions/pluggy-sync-connection/index.ts`:

- Trocar `console.error("upsert tx",…)` por log estruturado com `connectionId`, `providerTxId`, mensagem — para próximos diagnósticos.
- Contar `resp.results.length` por página e logar por conta (`{providerAccountId, page, received, imported}`).
- Retornar no response um breakdown por conta em vez de só `{imported, error}`, para a UI exibir "X lançamentos importados" e mensagens de "Pluggy ainda coletando transações — tente em alguns minutos" quando `results=0` mas item.status = updated.
- Frontend: ao reativar `auto_import`, disparar `pluggy-sync-connection` automaticamente (evita a confusão atual em que o toggle sozinho não importa histórico).

## Detalhes técnicos

Arquivos previstos:
- `supabase/functions/pluggy-sync-connection/index.ts` — logging estruturado + retorno detalhado.
- `src/components/accounts/OpenFinanceSection.tsx` / `src/hooks/usePluggy.ts` — auto-sync ao ligar `auto_import`; toast com breakdown do sync.
- Possível migração SQL se `pluggy_upsert_transaction` precisar de ajuste (a decidir após Passo 1).

Nenhuma mudança de schema ou de negócio: só instrumentação, correção de fluxo e UX. Vou aplicar apenas o que o Passo 1 apontar como causa.
