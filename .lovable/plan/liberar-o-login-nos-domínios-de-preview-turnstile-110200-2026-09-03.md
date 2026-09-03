# Liberar o login nos domínios de preview (Turnstile 110200)

## O problema

O widget Turnstile só aceita os hostnames cadastrados no painel Cloudflare. O domínio de preview (`id-preview--...lovable.app`) não está nessa lista, então o widget devolve o código **110200** e o botão Entrar fica bloqueado.

## A solução

Em domínios de desenvolvimento (preview Lovable e localhost) o app passa a usar a **chave de teste oficial do Cloudflare**, que sempre aprova a verificação. No site oficial (`aveto360.com` / `www.aveto360.com` e o app publicado) nada muda: continua a verificação real com a chave e o segredo de produção.

Resultado: login funciona no preview sem desligar o CAPTCHA em produção.

## Detalhes técnicos

1. `supabase/functions/auth-config/index.ts`
   - Ler o `Origin`/`Referer` da requisição e, quando o hostname for de desenvolvimento (`localhost`, `127.0.0.1`, `*.lovable.app`, `*.lovableproject.com`), responder a site key de teste do Cloudflare `1x00000000000000000000AA`; caso contrário, a chave de produção atual.
   - Devolver também um campo `mode: "test" | "live"` para o front poder logar/depurar.
   - Ajustar o `Cache-Control` para variar por origem (`Vary: Origin`) e evitar cache cruzado entre preview e produção.

2. `supabase/functions/auth-login/index.ts` e `supabase/functions/auth-recovery-request/index.ts`
   - Aplicar a mesma detecção de hostname de desenvolvimento a partir do `Origin`.
   - Quando for hostname de desenvolvimento, validar o token com o **secret de teste** `1x0000000000000000000000000000000AA`; em produção, seguir usando `TURNSTILE_SECRET`/`TURNSTILE_SECRET_KEY`.
   - A verificação nunca é ignorada: o `siteverify` continua obrigatório em todos os caminhos.

3. Front-end
   - Sem mudança de lógica; o hook `useTurnstileSiteKey` já consome a `auth-config`. Nas telas de login/recuperação, quando o modo for de teste, exibir um aviso discreto "verificação em modo de teste (ambiente de preview)".
   - Manter o tratamento de erro atual (`describeTurnstileError`) para o caso de outro hostname não previsto.

4. Verificação
   - Typecheck + testes.
   - Abrir `/auth` no preview e confirmar que o widget aprova e o login envia sem o erro 110200.
