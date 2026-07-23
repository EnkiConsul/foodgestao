# Diagnóstico — Login unificado 360°FOOD

## Fluxos atuais
- **`/auth`** (`src/pages/Auth.tsx`): login por e-mail via `supabase.auth.signInWithPassword` no cliente. Aba de signup usa `supabase.auth.signUp`.
- **`/dp/login`** (`src/pages/dp/DpLogin.tsx`): chama a RPC pública `resolve_cpf_login(_cpf text)` → recebe e-mail canônico (formato sintético `cpf<11d>@portal.360food.local`) → executa `signInWithPassword` no cliente.

**Vazamento crítico**: qualquer cliente com anon key consegue chamar `resolve_cpf_login` e correlacionar CPF ↔ e-mail canônico (enumeração).

## Tipos de acesso encontrados
| Fonte | Papéis |
|-------|--------|
| `user_roles.role` (enum `app_role`) | `super_admin`, `admin`, `user`, `dp_colaborador` |
| `companies.user_id` | owner do tenant |
| `company_members.role` | `owner`, `admin`, `member`, `viewer` |
| `dp_colaboradores.perfil_acesso` | `colaborador`, `gestor`, `admin` (escopo DP apenas) |

## Rotas protegidas
- `src/routes/onboardingGuards.tsx` — sessão + onboarding.
- `src/components/admin/SuperAdminRoute.tsx` — `has_role(_,'super_admin')`.
- `src/components/dp/ColaboradorShell.tsx` — `is_dp_colaborador()`.
- `src/components/modules/ModuleGuard.tsx` — módulo contratado.
- Guards de permissão em `useCompanyPermissions.tsx`.

## Comportamento atual do MFA
- Nenhum guard obrigatório para `aal2`. Existe `admin-reset-mfa` (super_admin). Sem enforcement em edge functions sensíveis.

## Forma atual de criação de acesso (colaborador)
- `supabase/functions/dp-criar-acesso-colaborador/index.ts`:
  - Cria usuário Auth com `email = cpf<11d>@portal.360food.local`.
  - **Senha = últimos 6 dígitos do CPF** (previsível).
  - Vincula `dp_colaboradores.user_id` e `email_portal`.
  - Grava `user_roles(dp_colaborador)`.
  - Retorna senha no payload.

## Forma atual de reset de senha
- `supabase/functions/dp-alterar-senha-colaborador` — admin escolhe nova senha.
- `supabase/functions/dp-reset-password` — reset acionado pelo admin.
- **Não há canal self-service para o colaborador** (nem por e-mail sintético, nem por WhatsApp).

## Estado do banco (métricas)
- `dp_colaboradores`: 14 total, 2 com `user_id`, 12 sem.
- CPFs distintos: 14 (sem duplicidade interna).
- Nenhum CPF mapeado a `user_id`s diferentes.
- Verificação em `auth.users` (e-mails sintéticos, órfãos): schema `auth` não é legível via psql direto; será verificada via Edge Function service-role no Bloco 7 (backfill).

## Riscos identificados
1. **Enumeração via `resolve_cpf_login`**: exposta a `anon`/`authenticated`, retorna e-mail canônico.
2. **Senha provisória fraca**: 6 dígitos derivados do CPF (documento público em muitos contextos brasileiros).
3. **Sem `must_change_password`**: colaborador mantém a senha fraca indefinidamente.
4. **Sem rate limit persistente** no login (`signInWithPassword` direto).
5. **Sem MFA obrigatório** para super_admin/owner/admin.
6. **Sem recuperação self-service** — depende de intervenção do admin.
7. **Cross-tenant no DP**: `perfil_acesso` está por colaborador (empresa-escopo), mas guards atuais tratam `is_dp_colaborador` como global.
8. **`resolve_cpf_login` no browser** — tempos de resposta observáveis permitem enumeração.
9. **CPF em `user_metadata`** — dados sensíveis em campo cliente-visível.
10. **`admin.auth.admin.listUsers(perPage=200)`** em `dp-invite-colaborador` — não escala e pode omitir usuários.

## Arquivos a alterar
### Frontend
- `src/pages/Auth.tsx` (campo único e-mail/CPF, remove signup/CPF split).
- `src/pages/dp/DpLogin.tsx` → substituir por `<Navigate to="/auth" replace />`.
- `src/hooks/useAuth.tsx` (nova `signIn(identifier, password, captchaToken?)`).
- `src/App.tsx` (rotas `/acesso`, `/selecionar-acesso`, `/primeiro-acesso`, `/recuperar-acesso`, `/redefinir-senha`, `/acesso-indisponivel`).
- `src/components/dp/DpColaboradorRoute` + `DpAdminRoute` (a criar/refatorar).
- Tela de colaboradores (novo diálogo de senha provisória, status).

### Backend (Edge Functions)
- **Novas**: `auth-login`, `auth-complete-first-access`, `auth-start-cpf-recovery`, `auth-verify-cpf-recovery-identity`, `auth-send-cpf-recovery-whatsapp`, `auth-verify-cpf-recovery-otp`, `auth-complete-cpf-recovery`, `whatsapp-auth-webhook`.
- **Alteradas**: `dp-criar-acesso-colaborador` (senha forte), `dp-reset-password` (senha forte + flag), `dp-invite-colaborador` (usar `getUserByEmail`).

### Migrations
- `auth_login_identifiers`, `auth_user_security_state`, `auth_recovery_challenges`, `auth_rate_limits`.
- RPCs: `get_my_access_contexts()`, `is_password_change_required()`, `auth_access_enabled()`.
- `REVOKE` em `resolve_cpf_login`.

## Secrets novos
`LOGIN_IDENTIFIER_PEPPER`, `WHATSAPP_PROVIDER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`, `CAPTCHA_SECRET`.

## Plano (blocos)
1. **Este relatório**.
2. Modelo de dados (migration única).
3. `auth-login` + tela unificada.
4. `/acesso` + resolução automática.
5. Senha provisória forte + `/primeiro-acesso`.
6. Recuperação via WhatsApp.
7. Backfill + limpeza.
8. MFA + testes + rollback.

## Gates
- Nenhum bloqueador crítico do Bloco 1 (sem CPFs conflitantes hoje).
- Prosseguir para Bloco 2 (modelo de dados).
