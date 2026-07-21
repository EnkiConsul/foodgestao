# Colocar a integração Pluggy em produção

A integração já está implementada (Edge Functions `pluggy-connect-token`, `pluggy-register-item`, `pluggy-sync-connection`, `pluggy-delete-connection`, `pluggy-webhook` + widget no frontend com `includeSandbox: false`). Falta apenas configurar credenciais de produção, webhook e validação end-to-end.

## Passo 1 — Obter credenciais de produção na Pluggy

No painel [dashboard.pluggy.ai](https://dashboard.pluggy.ai):

1. Ativar a conta em modo **Produção** (requer contrato assinado com a Pluggy e aprovação regulatória do Open Finance).
2. Em **Aplicações → Credenciais**, copiar:
   - `Client ID` de produção
   - `Client Secret` de produção
3. Gerar um token forte para autenticar o webhook (ex.: `openssl rand -hex 32`) — esse valor será usado nos dois lados (Pluggy + nosso backend).

## Passo 2 — Salvar os 3 secrets no backend

Vou solicitar via formulário seguro (`add_secret`) os seguintes secrets de runtime:

- `PLUGGY_CLIENT_ID` — Client ID de produção
- `PLUGGY_CLIENT_SECRET` — Client Secret de produção
- `PLUGGY_WEBHOOK_TOKEN` — token forte gerado no passo 1

Essas variáveis já são lidas por `supabase/functions/_shared/pluggy.ts` e `pluggy-webhook/index.ts`. Nenhuma mudança de código é necessária.

## Passo 3 — Registrar o Webhook na Pluggy

No painel Pluggy, em **Webhooks**, cadastrar:

- **URL**: `https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/pluggy-webhook`
- **Eventos**: `item/updated`, `item/error`, `transactions/updated`, `transactions/created`, `item/deleted`
- **Header customizado**: `x-pluggy-webhook-token: <mesmo valor do PLUGGY_WEBHOOK_TOKEN>`

A função `pluggy-webhook` já valida esse header e dispara `pluggy-sync-connection` automaticamente.

## Passo 4 — Validação end-to-end (produção)

Depois dos secrets salvos:

1. Abrir `/contas-bancarias` → "Conectar banco (Open Finance)" e conectar uma conta real (não sandbox).
2. Confirmar que aparece em `bank_connections` com `status = updated`.
3. Verificar em `pluggy_webhook_events` que os eventos chegam com `processed_at` preenchido.
4. Rodar um sync manual e conferir que transações são importadas em `transactions` com `origin = 'pluggy'`.
5. Testar desconexão (`pluggy-delete-connection`) e reconexão.

## Passo 5 — Observabilidade

- Monitorar `edge_function_logs` das 5 funções `pluggy-*` nas primeiras 48h.
- Alertar em `bank_connections.last_error IS NOT NULL` ou `status = 'error'`.

## Notas técnicas

- O código já está production-ready: nenhuma referência a sandbox no runtime, `pluggy-webhook` já está com `verify_jwt = false` no `config.toml`, e há retry/refresh de `apiKey` (100 min de cache) no cliente compartilhado.
- Os secrets `PLUGGY_*` devem ser adicionados via `add_secret` — nunca commitados no `.env` do projeto.
- Se a Pluggy exigir IP allowlist, o Supabase Edge Runtime não expõe IP fixo; solicitar isenção ou usar a lista pública de ranges do Deno Deploy.

## O que farei em modo build

1. Chamar `add_secret` para os 3 secrets (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_TOKEN`).
2. Aguardar você confirmar que cadastrou o webhook no painel Pluggy com a URL e o token.
3. Fazer um smoke test das funções via logs após você conectar a primeira conta real.
