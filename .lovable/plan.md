
## Objetivo

Implementar os **Blocos 3–6** do PROMPT DEFINITIVO: login unificado por e-mail/CPF com identificação automática do tipo de acesso, CAPTCHA Cloudflare Turnstile, rate limit persistente e recuperação de senha por WhatsApp com OTP.

Escopo: **backend + frontend do login**. Não altera módulos financeiros, DP funcional ou multiempresa.

---

## Bloco 0 — Secrets (pré-requisito)

Abrir formulário `add_secret` para o usuário colar:

- `TURNSTILE_SITE_KEY` — Site Key pública do Cloudflare Turnstile.
- `TURNSTILE_SECRET_KEY` — Secret Key privada do Turnstile.

WhatsApp: já existe integração? Verificar `secrets--fetch_secrets`. Se não houver provedor configurado, perguntar entre **Twilio WhatsApp API** ou **Meta Cloud API** — solicitado num sub-passo antes do Bloco 6.

---

## Bloco 1 — Banco de dados (migração única)

### Tabelas novas

```text
auth_login_attempts
  id, identifier (email lowercase ou cpf digits), ip, success, created_at
  índice: (identifier, created_at desc), (ip, created_at desc)
  retenção: TTL 24h via cron

auth_recovery_otp
  id, user_id, phone_hash, otp_hash (bcrypt), attempts, max_attempts=5,
  expires_at (10min), consumed_at, created_at, ip
  índice: (user_id, expires_at)

auth_recovery_events
  id, user_id, event (start|verify_ok|verify_fail|reset_ok|rate_limited),
  ip, created_at
```

### Funções SECURITY DEFINER

```text
public.resolve_login_identifier(identifier text)
  → retorna { user_id, email_real, kind: 'owner'|'admin'|'member'|'viewer'|'super_admin'|'colaborador_dp', active bool }
  Aceita e-mail OU CPF. Nunca revela existência ao chamador não-admin.

public.check_login_rate_limit(identifier text, ip text)
  → boolean; janela deslizante 15min, máx 5 falhas por identifier, 20 por IP.

public.record_login_attempt(identifier text, ip text, success bool)

public.consume_recovery_otp(user_id uuid, otp_plain text)
  → boolean; bcrypt compare, incrementa attempts, invalida após 5 falhas.
```

Todas com `SET search_path = public, auth`. GRANT EXECUTE apenas para `service_role`.

---

## Bloco 3 — Edge Function `auth-login` (unificada)

Fluxo:

```text
1. Valida body: { identifier, password, turnstile_token, ip? } via Zod.
2. Valida turnstile_token contra siteverify da Cloudflare (Secret Key).
3. check_login_rate_limit → 429 se excedido.
4. resolve_login_identifier(identifier):
     - CPF → busca dp_colaboradores.cpf_hash e retorna email sintético
     - E-mail → normaliza lowercase + trim
5. Se not found ou !active → mensagem genérica "credenciais inválidas"
   (record_login_attempt success=false, sempre com delay artificial 200-400ms).
6. signInWithPassword(email_real, password) via service_role admin API
   → retorna sessão para o cliente.
7. record_login_attempt success=true; retorna { session, kind, redirect_to }.
```

Nada de senha derivada de CPF, nada de e-mail exposto no retorno de erro, nada de role vinda do frontend.

---

## Bloco 4 — Frontend `/login` unificado

- Um único campo `identifier` (autodetecta e-mail vs CPF por regex/máscara).
- Campo senha + widget Turnstile (`@marsidev/react-turnstile`).
- Botão "Entrar" → chama `auth-login` edge function, nunca `supabase.auth.signInWithPassword` direto.
- Após sucesso: `supabase.auth.setSession(data.session)` + redireciona conforme `kind`:
  - `super_admin` → `/admin`
  - `colaborador_dp` → `/dp/inicio`
  - demais → `/` (dashboard financeiro)
- Remove páginas separadas `/dp/login` e qualquer login por CPF paralelo (redirecionar para `/login`).
- Link "Esqueci minha senha" → `/recuperar-senha`.

---

## Bloco 5 — Rate limit visual e proteções

- Após 3 falhas → widget Turnstile re-validado obrigatoriamente.
- Após 5 falhas → mensagem "Muitas tentativas. Tente novamente em X minutos" (X vindo do backend).
- Atraso progressivo server-side: 0ms, 300ms, 800ms, 1500ms, 3000ms.

---

## Bloco 6 — Recuperação por WhatsApp OTP

### Edge Functions novas

```text
auth-start-cpf-recovery
  body: { identifier, turnstile_token }
  1. Valida turnstile + rate limit (3/hora por identifier, 10/hora por IP)
  2. resolve_login_identifier → busca telefone em dp_colaboradores.telefone
     OU em profiles.phone (para não-DP)
  3. Se sem telefone válido → resposta genérica de sucesso (não revela)
  4. Gera OTP 6 dígitos, bcrypt, insere auth_recovery_otp (10min)
  5. Envia via WhatsApp (Twilio ou Meta Cloud API) — número vem do backend
  6. Log em auth_recovery_events

auth-verify-cpf-recovery-otp
  body: { identifier, otp }
  1. Rate limit 5 tentativas
  2. consume_recovery_otp
  3. Se ok: gera short-lived reset token JWT (5min) e retorna
  4. Log em auth_recovery_events

auth-reset-password-with-token
  body: { reset_token, new_password }
  1. Valida JWT (assinado por secret backend)
  2. Valida força (>=8, mistura de classes; HIBP se habilitado)
  3. admin.updateUserById(user_id, { password })
  4. Invalida todas as sessões existentes
  5. Log em auth_recovery_events
```

### Frontend

```text
/recuperar-senha
  Passo 1: identifier + turnstile → chama auth-start-cpf-recovery
  Passo 2: campo OTP 6 dígitos → chama auth-verify-cpf-recovery-otp
  Passo 3: nova senha + confirmação → chama auth-reset-password-with-token
  Redireciona para /login com toast de sucesso.
```

---

## Critérios de aceite (verificação antes de declarar pronto)

- Não há mais senha derivada de CPF (Bloco anterior de acesso DP a ser deprecado).
- E-mail sintético `cpf<CPF>@portal.360food.local` **não** aparece em nenhuma resposta pública/JSON de erro.
- `dp_colaboradores` inativo (`ativo=false`) não consegue logar.
- Role sempre calculada server-side via `has_role`/`resolve_login_identifier`, nunca lida do body.
- OTP armazenado apenas como bcrypt hash.
- Rate limit sobrevive a restart (persistido em tabela).
- Rota `/admin` protegida por `has_role(auth.uid(), 'super_admin')` em RLS + guard React.
- Login antigo `/dp/login` redireciona para `/login` unificado.

---

## Ordem de execução

```text
0. add_secret Turnstile (+ perguntar provedor WhatsApp)
1. Migração SQL (tabelas + funções + índices + GRANTs + RLS)
2. Edge Function auth-login + verify_jwt=false
3. Página /login unificada + remoção de /dp/login
4. Edge Functions auth-start-cpf-recovery, auth-verify-cpf-recovery-otp, auth-reset-password-with-token
5. Página /recuperar-senha (3 passos)
6. Cron job de limpeza (auth_login_attempts > 24h, auth_recovery_otp expirados)
7. Testes manuais end-to-end + security scan
```

---

## Detalhes técnicos

- **CAPTCHA:** `@marsidev/react-turnstile` no frontend; `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` no backend com `secret` + `response`.
- **OTP:** `crypto.randomInt(100000, 999999)` no Deno; hash com `bcrypt` (custo 10).
- **WhatsApp:** provedor a definir no passo 0; template pré-aprovado. Número destino sempre lido do banco pelo backend, nunca do frontend.
- **JWT reset token:** assinado com `JWT_SECRET` (gerar via `generate_secret` se não existir), payload `{ user_id, purpose:'password_reset', exp }`.
- **Rate limit:** função `check_login_rate_limit` faz SELECT COUNT com janela deslizante — SQL puro, sem estado em memória.
