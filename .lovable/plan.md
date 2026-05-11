## Atualizar token do webhook Asaas

O token `whsec_qjsuG75RGSLyEp9ud1Vn6Eas87o_x-IT1zXRM2UgBKo` (configurado no painel do Asaas) precisa ser armazenado no secret `ASAAS_WEBHOOK_TOKEN` para que a edge function `asaas-webhook` valide corretamente os eventos recebidos.

### Passos

1. Atualizar o secret `ASAAS_WEBHOOK_TOKEN` com o novo valor via `secrets--update_secret`.
2. Validar funcionamento usando o botão **"Testar webhook"** em `/admin/webhooks-asaas` — a edge function `asaas-webhook-test` envia um evento sintético para `asaas-webhook` usando esse mesmo secret. Se retornar 200, a validação está correta.
3. Conferir em `/admin/webhooks-asaas` se o evento de teste aparece na lista de logs.

### Observações

- Nenhuma alteração de código é necessária — a edge function `asaas-webhook` já lê `Deno.env.get('ASAAS_WEBHOOK_TOKEN')` e compara com o header `asaas-access-token`.
- Após atualizar o secret, garanta que no painel do Asaas (Sandbox/Produção) o webhook esteja registrado com:
  - URL: `https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/asaas-webhook`
  - Token de autenticação: `whsec_qjsuG75RGSLyEp9ud1Vn6Eas87o_x-IT1zXRM2UgBKo`
  - Versão da API: v3
  - Eventos: todos `PAYMENT_*` e `SUBSCRIPTION_*`