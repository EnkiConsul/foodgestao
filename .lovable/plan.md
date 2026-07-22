# Corrigir importação Pluggy após webhook `transactions/*`

## Diagnóstico confirmado

- Ao clicar "Sincronizar", a Pluggy ainda estava coletando → devolveu 410 em `listTransactions` e 409/400 em `triggerItemUpdate` (rate-limit / já atualizando). Nada foi importado.
- Logo em seguida, a Pluggy enviou `transactions/created` e `transactions/updated` (registrados em `pluggy_webhook_events` do item Santander), mas o auto-reimport disparado pelo `pluggy-webhook` chama `pluggy-sync-connection` com o `SUPABASE_SERVICE_ROLE_KEY` como Bearer. Essa função valida permissão via `can_sync_bank_connection`, que usa `auth.uid()`. Para service role, `auth.uid()` é `NULL` → retorna `false` → 403. O reimport nunca acontece.
- Consequência: 0 linhas em `transactions` com `provider='pluggy'` mesmo após a Pluggy avisar que a coleta terminou. O usuário ficaria dependendo de clicar "Sincronizar" novamente — e, se estiver dentro da janela de 1h, cairia no 409 outra vez.

Sintoma secundário: entregas retentadas da Pluggy chegaram sem o header do token e foram rejeitadas (401). Não é fatal, mas indica config duplicada do webhook.

## Objetivo

Fazer com que, quando a Pluggy avisar `transactions/created` ou `transactions/updated`, o sistema **importe imediatamente** os lançamentos sem depender de novo clique do usuário, mantendo a proteção da rota manual.

## Escopo — 3 mudanças cirúrgicas

### 1. `pluggy-sync-connection` — aceitar chamadas internas (service role)

- Detectar quando a requisição vem com o **service role key** no `Authorization` (comparando com `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`).
- Nesse caminho: pular `getClaims` e `can_sync_bank_connection`, considerar como "chamada de sistema" e prosseguir com o `admin` client (já em uso hoje).
- Chamadas com JWT de usuário continuam passando pela mesma validação atual — nada muda para o front.

### 2. `pluggy-webhook` — passar o motivo para o sync e evitar `triggerItemUpdate`

- Ao chamar `pluggy-sync-connection` a partir do webhook, incluir `body: { connectionId, source: "webhook", skipItemUpdate: true }`.
- O sync, quando `skipItemUpdate=true`, ao receber 410 em `listTransactions`, **não** dispara `triggerItemUpdate` (a coleta já foi concluída — o próprio webhook comprova). Apenas registra `perAccount[].error` e segue.
- Registrar log estruturado (`scope:"pluggy-webhook", step:"trigger_sync"`) com o resultado devolvido pelo sync (`imported`, `perAccount`) para diagnóstico.

### 3. Painel `/admin/open-finance` — botão "Reimportar (sem trigger)"

- Novo botão secundário ao lado de "Sincronizar" que chama `pluggy-sync-connection` com `skipItemUpdate=true`. Útil quando o item já foi atualizado recentemente e o usuário só quer puxar o que a Pluggy já tem, sem cair no 409 de rate-limit.
- Mostrar toast com `imported` e `perAccount` (contagem por conta, erros individuais).

## Fora de escopo

- Não mexer no dedupe/`pluggy_upsert_transaction` — já cobre reimport idempotente.
- Não alterar o fluxo Connect Widget nem `pluggy-register-item`.
- Não mudar a política do webhook token; apenas anotar que o usuário pode ter uma segunda configuração de webhook sem token na Pluggy (verificar depois).

## Como validar depois do build

1. Clicar "Reimportar (sem trigger)" no painel `/admin/open-finance` para a conexão Santander (990dc6c9…). Esperado: `imported > 0` no toast e novos registros em `transactions` com `provider='pluggy'`.
2. Verificar em `bank_connection_accounts` que `last_synced_tx_date` avançou.
3. Provocar novo webhook (uma sincronização real ou reenvio pela Pluggy) e checar em `pluggy_webhook_events` que `processed_at` foi preenchido **e** que os logs do `pluggy-sync-connection` mostram `source:"webhook"` com `imported > 0`.

## Detalhes técnicos

- Arquivos: `supabase/functions/pluggy-sync-connection/index.ts`, `supabase/functions/pluggy-webhook/index.ts`, `src/pages/admin/OpenFinance.tsx`.
- Reconhecimento service role: `authHeader === "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`. Como o header nunca sai do runtime, é seguro para autenticar chamadas internas.
- `BodySchema` do sync ganha `source: z.enum(["user","webhook","admin"]).optional()` e `skipItemUpdate: z.boolean().optional()`. `fullResync` continua igual.
- No caminho `410`, quando `skipItemUpdate=true`, apenas devolve `acctError` sem chamar `triggerItemUpdate`.
- Logs continuam JSON estruturado (mesmo padrão atual).
