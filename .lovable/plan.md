
# Plano — Login unificado 360°FOOD

## DIAGNÓSTICO DE AUTENTICAÇÃO

**Fluxos atuais**
- `/auth` (`src/pages/Auth.tsx`): login por e-mail via `supabase.auth.signInWithPassword`.
- `/dp/login` (`src/pages/dp/DpLogin.tsx`): usa RPC pública `resolve_cpf_login(cpf)` → devolve e-mail sintético `cpf<11d>@portal.360food.local` → `signInWithPassword` no cliente. **Vazamento:** qualquer um consulta o e-mail canônico a partir do CPF.
- Sem tela unificada; sem `/primeiro-acesso`; sem recuperação por WhatsApp; reset atual (`dp-reset-password`) devolve senha de 6 dígitos (últimos do CPF em `dp-criar-acesso-colaborador`).

**Tipos de acesso encontrados**
- `user_roles.role`: `super_admin`, `admin`, `user`, `dp_colaborador`.
- `companies.user_id` (owner), `company_members.role` (`owner|admin|member|viewer`), `dp_colaboradores.perfil_acesso` (`colaborador|gestor|admin`).

**Rotas protegidas**: guards em `src/routes/onboardingGuards.tsx`, `SuperAdminRoute`, `ModuleGuard`, `ColaboradorShell`.

**Riscos críticos**
1. `resolve_cpf_login` exposta a `authenticated`/`anon` → enumeração e vazamento de e-mail canônico.
2. Senha provisória = 6 últimos dígitos do CPF (`dp-criar-acesso-colaborador`) — previsível.
3. Sem `must_change_password` — usuário permanece com senha fraca indefinidamente.
4. Sem rate limit persistente no login.
5. Sem MFA obrigatório para admin/owner.
6. Sem canal de recuperação para colaborador (hoje só admin reseta).
7. `resolve_cpf_login` roda no browser → tempos de resposta permitem enumeração.

**Estado do banco (auditoria rápida)**
- 14 colaboradores (2 com `user_id`, 12 sem). Nenhum CPF associado a mais de um `user_id`. Funções `resolve_cpf_login`, `has_role`, `is_dp_colaborador` presentes; `get_my_access_contexts` ainda não existe.

**Arquivos a alterar (principais)**
- Frontend: `src/pages/Auth.tsx`, `src/pages/dp/DpLogin.tsx` (→ redirect), `src/hooks/useAuth.tsx`, `src/App.tsx` (novas rotas), `src/components/dp/*Route`, tela de colaboradores.
- Backend: novas Edge Functions `auth-login`, `auth-complete-first-access`, `auth-start-cpf-recovery`, `auth-verify-cpf-recovery-identity`, `auth-send-cpf-recovery-whatsapp`, `auth-verify-cpf-recovery-otp`, `auth-complete-cpf-recovery`, `whatsapp-auth-webhook`. Alterar `dp-criar-acesso-colaborador`, `dp-reset-password`.
- Migrations: `auth_login_identifiers`, `auth_user_security_state`, `auth_recovery_challenges`, `auth_rate_limits`, RPC `get_my_access_contexts()`, `is_password_change_required()`, `auth_access_enabled()`, revogação de `resolve_cpf_login`.

**Secrets novos**
`LOGIN_IDENTIFIER_PEPPER`, `WHATSAPP_PROVIDER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`, `CAPTCHA_SECRET` (hCaptcha/Turnstile).

---

## PLANO DE EXECUÇÃO (blocos)

Vou executar em blocos incrementais. Cada bloco entrega o formato "BLOCO EXECUTADO" descrito na spec. Escopo desta aprovação: **Blocos 1–4**. Blocos 5–8 seguem após validação.

### Bloco 1 — Diagnóstico detalhado (relatório)
- Relatório completo: CPF duplicado, user_ids conflitantes, e-mails sintéticos, colaboradores inativos com acesso, usuários Auth sem vínculo.
- Não altera nada em prod. Entregue como markdown em `.lovable/auditoria/auth-unificado.md`.

### Bloco 2 — Modelo de dados
Migration única (com GRANTs e RLS):
- `auth_login_identifiers(user_id, identifier_type, identifier_hash, identifier_last4, is_active, source)` — unique(type, hash); sem policies de leitura para anon/authenticated.
- `auth_user_security_state(user_id PK, must_change_password, provisional_password_issued_at/expires_at, password_changed_at/by, access_blocked, blocked_at/by/reason, sessions_revoked_at)`.
- `auth_recovery_challenges(...)` conforme §26.
- `auth_rate_limits(bucket text, key_hash text, window_start, count)` — chaves por IP, HMAC(identifier), IP+identifier.
- RPCs: `get_my_access_contexts()` (usa `auth.uid()`, filtra empresas/colaboradores ativos), `is_password_change_required()`, `auth_access_enabled()`.
- Revogar `resolve_cpf_login` de `PUBLIC, anon, authenticated`.

### Bloco 3 — Edge Function `auth-login` + tela única
- `auth-login` (`verify_jwt=false`): valida CAPTCHA, normaliza identifier, detecta e-mail vs CPF (11 dígitos + DV), HMAC-SHA256 com `LOGIN_IDENTIFIER_PEPPER` para CPF, resolve `user_id` via `auth_login_identifiers` no service-role, obtém e-mail canônico do Auth admin, chama `signInWithPassword` em cliente com chave pública (não service-role). Retorna só `access_token/refresh_token/expires_in`. Erros sempre genéricos. Rate limit persistente.
- Frontend: `useAuth.signIn(identifier, password, captchaToken?)` chama `auth-login` e faz `supabase.auth.setSession`. `Auth.tsx` com campo único "E-mail ou CPF". `/dp/login` vira `<Navigate to="/auth" replace />`.

### Bloco 4 — Resolução automática + rota `/acesso`
- Página `/acesso`: consulta `auth_user_security_state` → prioridades (blocked → must_change_password → MFA → contextos).
- Página `/selecionar-acesso` com cards (super_admin, empresas por role, DP por empresa).
- `/acesso-indisponivel` para usuários sem contexto ativo.
- `useAuth` centraliza redirect pós-login para `/acesso`.
- Persistir último contexto por usuário (localStorage + revalidação backend a cada login).

### Bloco 5 — Cadastro + senha provisória forte + `/primeiro-acesso`
- Refatorar `dp-criar-acesso-colaborador`: gerar senha 16+ chars com `crypto.getRandomValues` (maiúscula+minúscula+número+símbolo), gravar `auth_login_identifiers` (HMAC CPF), setar `must_change_password=true`, `provisional_password_expires_at=now()+24h`, atualizar `app_metadata.must_change_password` (service role), auditoria sem senha.
- Diálogo admin exibe a senha uma única vez com checkbox de confirmação; estado limpo ao fechar.
- Página `/primeiro-acesso` com política de senha forte + rejeição de padrões (CPF, nome, telefone…); Edge `auth-complete-first-access` atualiza senha, limpa flags, revoga demais sessões.
- Guard `FirstAccessGuard` bloqueia toda rota exceto `/primeiro-acesso`, `/logout`, docs legais.

### Bloco 6 — Recuperação via WhatsApp
- Página `/recuperar-acesso` (wizard 4 etapas).
- Edge Functions: `auth-start-cpf-recovery`, `auth-verify-cpf-recovery-identity` (WhatsApp+nascimento cadastrados, comparação server-side, resposta genérica), `auth-send-cpf-recovery-whatsapp` (Meta Cloud API oficial, OTP 6 dígitos, hash + expiração 5min), `auth-verify-cpf-recovery-otp`, `auth-complete-cpf-recovery`.
- `whatsapp-auth-webhook` com validação de assinatura, idempotência por `message_id`.
- Sem seleção de número pelo frontend; destino sempre `dp_colaboradores.whatsapp` do backend.
- Reenvio (60s cooldown, 3/h, 5/24h). Bloqueio 24h após troca de WhatsApp.

### Bloco 7 — Backfill e limpeza
- Script server-side: para cada colaborador com `user_id`, calcula HMAC e insere em `auth_login_identifiers`.
- Relatório de conflitos manuais (não auto-resolvidos).
- Remover CPF de `user_metadata`, dropar `resolve_cpf_login` após corte.

### Bloco 8 — Segurança/homologação
- MFA `aal2` obrigatório em Edge Functions sensíveis (super_admin, owner, admin, geração/reset de acesso, alteração de WhatsApp).
- Testes conforme §44 (unit + integração RLS + e2e).
- Ativar HIBP no Supabase.
- Documentar rollback: manter `resolve_cpf_login` desativada mas presente durante janela de rollback; feature flag `AUTH_UNIFIED_ENABLED`.

---

## Gates (não avançar sem confirmar)

- **Antes do Bloco 3**: CPF duplicado, user_ids conflitantes, permissões DP e rotas atuais precisam estar mapeados (Bloco 1).
- **Antes de remover login antigo**: e-mail, CPF, primeiro acesso e recuperação homologados; backfill concluído; rollback testado.

## Não incluído nesta aprovação
- Escolha do provedor WhatsApp (Meta Cloud direto vs BSP homologado) — pergunto no início do Bloco 6.
- Provedor de CAPTCHA (hCaptcha vs Cloudflare Turnstile) — pergunto no início do Bloco 3.
- Política de MFA por papel (obrigatório vs opt-in por empresa) — pergunto no Bloco 8.

Aprovar para começar pelo **Bloco 1 (diagnóstico detalhado)** e, em seguida, **Bloco 2 (modelo de dados)**?
