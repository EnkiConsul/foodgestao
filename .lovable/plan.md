## Diagnóstico

Testei o fluxo com o e-mail `rcbruto77@gmail.com` e confirmei em `auth_recovery_challenges` que os dois desafios recentes ficaram como:

- `user_id = NULL`
- `status = pending_identity`
- `otp_channel = NULL`, `otp_sent_at = NULL`, `whatsapp_delivery_status = NULL`

Ou seja, a Edge Function `auth-recovery-request` interpretou o identificador como "desconhecido" e caiu no caminho decoy — que, por design, **não chama a Z-API**. Por isso nenhuma mensagem é enviada, mesmo o cadastro existindo.

Investigando o código da função (`supabase/functions/auth-recovery-request/index.ts`) contra o schema real, achei dois bugs encadeados que explicam o `user_id = NULL`:

### Bug 1 — `user_id` da RPC é descartado

A RPC `resolve_login_identifier` já retorna `user_id` diretamente (verifiquei o `pg_get_functiondef`). A função, porém, ignora esse campo e tenta descobrir o usuário via `admin.auth.admin.listUsers({ email })`. Esse filtro por e-mail no `listUsers` não é suportado pelo GoTrue — ele devolve a primeira página independente do filtro, e o `find(x.email === email)` normalmente não bate.

### Bug 2 — fallback busca coluna inexistente

Quando o `listUsers` falha, o código tenta:

```ts
admin.from("auth_login_identifiers").select("user_id").eq("email", email)
```

Mas `auth_login_identifiers` **não tem a coluna `email`** (confirmado — erro `42703 column "email" does not exist`). O fallback nunca retorna nada.

Resultado: `userId` permanece `null`, o `if (userId && phone)` na hora do envio nunca é verdadeiro, e nenhuma mensagem sai.

### Bug 3 (correlato) — lookup do telefone em `profiles`

Mesmo que o `userId` fosse recuperado, a leitura do telefone está errada:

```ts
admin.from("profiles").select("phone").eq("id", userId)
```

Em `profiles` o `id` é o PK da linha; a coluna que aponta para o usuário é `user_id`. Confirmei em banco que para `user_id = 7432cb5e-…-a541` o `id` é `835df338-…-cf4b6`. O filtro por `id = userId` nunca retorna o perfil, então o `phone` (`62991250757`) nunca é lido.

## Correção proposta

Editar apenas `supabase/functions/auth-recovery-request/index.ts`:

1. **Usar o `user_id` que a RPC já devolve.** Após `resolve_login_identifier`, pegar `resolvedRow?.user_id` diretamente. Remover a chamada a `admin.auth.admin.listUsers({ email })` e o fallback quebrado em `auth_login_identifiers`.
2. **Corrigir o lookup do telefone no `profiles`** para filtrar por `user_id` (não `id`). Manter o fallback existente para `dp_colaboradores.whatsapp/telefone`.
3. Manter todo o resto igual: verificação Turnstile, rate limiting, insert do desafio, comportamento decoy quando não há `user_id`/telefone, e envio via `sendZapiText` só quando `userId && phone`.

Nenhuma alteração de schema, RLS, frontend, secrets ou nas outras funções de recuperação (`auth-recovery-verify`, `auth-recovery-reset`). O contrato de resposta pública (`challenge_id`, `challenge_token`, `expires_in`) permanece idêntico, preservando a proteção anti-enumeração.

## Validação

1. Após o deploy, disparar de novo o `/esqueci-senha` com `rcbruto77@gmail.com`.
2. Conferir em `auth_recovery_challenges` que o novo desafio agora tem `user_id` preenchido, `status = 'pending_otp'`, `otp_channel = 'whatsapp'`, `otp_sent_at` e (em caso de sucesso da Z-API) `whatsapp_delivery_status = 'sent'` + `whatsapp_message_id`.
3. Checar os logs da função por `[zapi]` para confirmar 2xx da Z-API. Se a Z-API responder erro, o log agora indica o motivo real (as chaves `Z_API_*` já estão configuradas como secrets).
4. Confirmar recebimento da mensagem no WhatsApp `55 62 99125-0757` e concluir o fluxo `verify` + `reset` com o OTP.

## Fora do escopo

- Reprocessar/limpar os desafios antigos com `user_id = NULL` (são inertes e expiram sozinhos em 10 min).
- Alterar o comportamento de decoy quando o identificador realmente não existe.
- Ajustes na página `/esqueci-senha` ou no fluxo de reenvio (já implementados).
