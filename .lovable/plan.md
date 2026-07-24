# Por que o Santander não apareceu

Investigação dos dados atuais:

- `open_finance_connections`: **vazio** — nenhuma conexão foi persistida.
- `open_finance_connection_requests`: 2 requests recentes do usuário com `status = 'token_created'` e `used_at = NULL` → o widget do Pluggy abriu, mas o passo de registro (`pluggy-item-register`) **nunca foi chamado**.
- Logs de `pluggy-item-register`: **sem invocações**. Confirma que o `onSuccess` do `PluggyConnect` não disparou (usuário fechou o widget antes do "Concluir", ou o SDK caiu num erro silencioso e roteou por `onError`).
- Logs de `pluggy-webhook`: recebeu chamada e devolveu `signature_mismatch` → o webhook do Pluggy está batendo, mas o HMAC não bate com `PLUGGY_WEBHOOK_SECRET`. Como o webhook é hoje o único caminho de fallback e ele está rejeitando tudo com 401, nada é persistido.

Resultado: o item foi criado no Pluggy, mas ficou órfão do nosso lado. Nem o fluxo primário (frontend → `item-register`) nem o fallback (webhook → worker) chegaram a gravar `open_finance_connections`.

# O que corrigir

## 1. Destravar o webhook (raiz do fallback)

O Pluggy manda `x-signature` (não `x-pluggy-signature`) e, em algumas contas, envia o HMAC sobre um payload canônico (não sobre o rawBody). Ajustar `supabase/functions/pluggy-webhook/index.ts`:

- Aceitar os headers `x-signature`, `x-pluggy-signature` e `signature` (primeiro não-vazio).
- Manter a validação HMAC constante, mas logar (sem segredo/payload) `header_present`, `header_length`, `expected_length` quando der mismatch para diagnóstico.
- Adicionar um modo de tolerância explícito via secret `PLUGGY_WEBHOOK_ALLOW_UNSIGNED=true` (opcional, só para destravar hoje enquanto validamos o secret correto no painel do Pluggy). Padrão continua exigindo assinatura.
- Não mexer no restante do fluxo (upsert idempotente, sem log de payload).

## 2. Reconciliar o item órfão do Santander

Criar Edge Function `pluggy-reconcile` (POST, autenticada, `is_company_admin_or_owner`) que:

- Recebe `{ company_id }`.
- Lê `open_finance_connection_requests` recentes (`status = 'token_created'`, últimas 24h, sem `used_at`).
- Chama `GET https://api.pluggy.ai/items?clientUserId=<company_id>` com API-KEY do Pluggy.
- Para cada item retornado sem `open_finance_connections` correspondente, chama o mesmo caminho interno de `pluggy-item-register` (mode `create`) e agenda um `pluggy-sync`.
- Retorna `{ recovered: N, item_ids: [...] }`.

## 3. Botão "Recuperar conexões" na UI

Em `src/pages/OpenFinance.tsx`, quando não houver conexões e existirem requests recentes com `status = 'token_created'`, mostrar CTA secundária "Recuperar conexão pendente" que chama `pluggy-reconcile`. Feedback via toast e invalidação de `["of-connections"]`.

## 4. Fechar o furo no fluxo primário

Em `src/components/open-finance/PluggyConnectLauncher.tsx`:

- Adicionar callback `onEvent` do SDK do Pluggy: quando `event === "ITEM_CREATED"` ou `"ITEM_UPDATED"` e `onSuccess` não tiver rodado até `onClose`, disparar `registerItem.mutateAsync` com o `itemId` capturado do evento antes de fechar.
- No `onError`, exibir toast específico ("Não foi possível concluir a conexão — use 'Recuperar conexão pendente'").

# Como testar

1. Deploy das mudanças.
2. Na UI, clicar em "Recuperar conexão pendente" → conexão Santander deve aparecer no grid.
3. Nova conexão Sandbox de ponta a ponta: verificar que `open_finance_connection_requests.used_at` fica preenchido e que a conexão aparece sem depender do webhook.
4. Enviar um webhook de teste do Pluggy: confirmar `open_finance_webhook_events` recebe status `pending` (fim do `signature_mismatch`).

# Detalhes técnicos

- Secret `PLUGGY_WEBHOOK_SECRET` deve ser exatamente o valor exibido no dashboard do Pluggy em "Webhooks → Signing secret". Se você quiser, no próximo turno confirmo o valor atual via `fetch_secrets` (apenas nome, sem valor) e oriento como atualizar.
- Nenhum schema muda; só código de Edge Functions e frontend.
- Nenhuma mudança em RLS.
