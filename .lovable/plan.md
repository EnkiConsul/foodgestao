## Objetivo
Quando o widget do Turnstile falhar por domínio não autorizado (código **110200**) ou por qualquer erro que impeça a geração do token, o usuário deve ver uma mensagem clara em português no lugar da caixa vermelha genérica da Cloudflare, e o botão **Entrar** deve ficar bloqueado (evitando a tentativa de submit que resultaria em falha silenciosa).

## Mudanças

### 1. `src/components/auth/TurnstileWidget.tsx`
- Adicionar prop `onError?: (code: string) => void` — repassa o código recebido em `error-callback` (ex.: `"110200"`).
- Manter `onExpire` para expiração (diferente de erro).
- Ocultar visualmente o iframe da Cloudflare via `.turnstile-hidden { display: none }` quando o pai passar `hidden={true}` (usado para esconder a mensagem de erro nativa após detectar 110200).

### 2. `src/pages/Auth.tsx`
- Novo estado `turnstileError: string | null`.
- Passar `onError={(code) => setTurnstileError(code)}` e `onToken={(t) => { setTurnstileToken(t); setTurnstileError(null); }}`.
- Quando `turnstileError` estiver setado:
  - Renderizar um `Alert` (variant destructive) logo acima do botão, com texto:
    > **Verificação de segurança indisponível neste domínio.** Não foi possível carregar o CAPTCHA (código {code}). Acesse pelo domínio oficial `gestor360food.com` ou peça ao administrador para autorizar este hostname no painel Cloudflare Turnstile.
  - Ocultar o widget nativo (que mostra "Não foi possível conectar ao site").
  - Desabilitar o botão **Entrar** (`disabled={submitting || !!turnstileError}`).
- No `handleSubmit`, retornar cedo se `turnstileError` estiver definido.
- Resetar `turnstileError` ao trocar de modo (login/signup/forgot).

### 3. Nada muda no backend
`auth-login` continua validando o token via `siteverify`. O fallback é apenas UX — não afrouxa segurança.

## Fora de escopo
- Não altera a configuração da Cloudflare (usuário adiciona os hostnames pelo painel).
- Não introduz bypass do CAPTCHA.
