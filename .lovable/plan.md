## Problema

O CAPTCHA (Cloudflare Turnstile) não aparece em `/auth` porque a Edge Function `auth-config`, que fornece a Site Key ao frontend, retorna erro "Failed to fetch". Isso deixa o hook `useTurnstileSiteKey` com string vazia e o widget não renderiza.

## Causa raiz (confirmada)

Em `supabase/config.toml` estão declaradas apenas 10 funções. As funções `auth-config` e `auth-login` **não estão listadas**, então herdam o default `verify_jwt = true`. Como `/auth` é acessado sem sessão (usuário ainda não logou), a chamada é rejeitada antes de atingir o handler — daí o `TypeError: Failed to fetch` nos logs do console e nas network requests.

## Correção

Adicionar entradas explícitas em `supabase/config.toml` marcando as duas funções como públicas (o próprio código já valida Turnstile e rate limit):

```toml
[functions.auth-config]
  verify_jwt = false
[functions.auth-login]
  verify_jwt = false
```

Nenhuma outra mudança é necessária: a função `auth-config` já está correta (retorna `TURNSTILE_SITE_KEY`), o secret está configurado, e o `TurnstileWidget` já reage à chegada da site key.

## Validação

Após o deploy automático:
1. Recarregar `/auth` e confirmar que o widget do Turnstile aparece abaixo dos campos.
2. Console deve deixar de mostrar `[useTurnstileSiteKey] falha ao carregar site key`.
3. Network: `GET /functions/v1/auth-config` deve retornar 200 com `{ turnstile_site_key: "..." }`.
