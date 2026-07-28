## Contexto

Você trocou, no painel da Pluggy, a URL do webhook pela versão **sem `?secret=`**. Nossa Edge Function `pluggy-webhook` hoje valida esse parâmetro contra `PLUGGY_WEBHOOK_SECRET` e rejeita qualquer chamada sem ele — então nenhum evento vai chegar ao banco enquanto estiver assim.

Você respondeu que quer **manter a validação com secret** (mais seguro). Portanto, não vamos alterar o backend; vamos voltar a URL correta no painel da Pluggy.

Também confirmando: **não preciso de `client_id`/`client_secret`**. Ambos já estão salvos como secrets do projeto (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`) e as Edge Functions leem direto de lá.

## Plano

1. Abrir `/admin/pluggy-webhook` no 360°FOOD e clicar em **Copiar URL** — ela sai já com `?secret=<token assinado>` embutido.
2. No painel da Pluggy → Webhooks, **substituir a URL atual** (sem segredo) pela copiada no passo 1 e salvar.
3. Disparar um evento de teste pela Pluggy (ou reconectar uma conta) e voltar aqui.
4. Eu consulto `pluggy_webhook_events` e os logs da função `pluggy-webhook` para confirmar recebimento e assinatura válida.

Nenhuma alteração de código ou migration é necessária neste passo.

## Observação técnica

O token no `?secret=` é um JWT curto assinado com `PLUGGY_WEBHOOK_SECRET`, com validade de ~2h. A página `/admin/pluggy-webhook` regenera sob demanda, então basta recopiar se expirar antes de você configurar na Pluggy.
