# D2 — Confirmação de e-mail antes do acesso

Auditoria pontual de 21/09/2026. **Nenhuma regressão encontrada; nenhum arquivo de produto alterado.**
Nenhuma conta real foi criada, nenhum e-mail foi enviado, nenhum link foi consumido e nenhuma
configuração foi modificada.

## 1. Configuração efetiva (não inferida de arquivo)

Lida do próprio serviço de contas em produção (`/auth/v1/settings`, com a chave pública):

| Chave | Valor |
|---|---|
| `mailer_autoconfirm` (Auto-confirm email) | **false** |
| `phone_autoconfirm` | false |
| `disable_signup` | false |

Confirma a mudança feita na interface em 19/09 e **não houve regressão**: o `supabase/config.toml` não
governa o backend gerenciado e não foi usado como fonte.

## 2. Caminho do cadastro comum

- `src/hooks/useAuth.tsx` → `signUp` chama `supabase.auth.signUp` e deriva
  `needsEmailConfirmation = !error && !alreadyRegistered && !data?.session`. Com Auto-confirm
  desligado, o serviço devolve usuário **sem sessão**, logo a flag fica verdadeira.
- `src/pages/Auth.tsx` (linhas ~390) → quando a flag é verdadeira, o fluxo entra no modo
  `confirm-email`, guarda o e-mail pendente, limpa as senhas, arma o intervalo de reenvio e **não
  chama `navigate`**. A navegação para `/onboarding` ou `/hub` está no ramo oposto, alcançado apenas
  quando o serviço devolve sessão.
- Rotas privadas: `ProtectedRoute` (`src/routes/onboardingGuards.tsx`) exige `user`; sem sessão
  redireciona para `/auth?redirect=...` e nunca renderiza o conteúdo. Como um usuário não confirmado
  não recebe sessão, ele não alcança área interna — a barreira não depende de checar
  `email_confirmed_at` no cliente.
- Login pelo servidor: `supabase/functions/auth-login/index.ts` autentica com o cliente anônimo
  (`signInWithPassword`). Com Auto-confirm desligado, **quem recusa e-mail não confirmado é o próprio
  serviço de contas** (`email_not_confirmed`), antes de qualquer token ser emitido; a função não
  contorna essa recusa em ponto algum (não usa `admin.createSession`, não gera link, não marca
  confirmação).

## 3. Exceções intencionais (mantidas, fora do escopo de correção)

- `dp-criar-acesso-colaborador`: cria o acesso do colaborador com `email_confirm: true`, porque o
  vínculo é validado pelo gestor e o colaborador entra por primeiro acesso/ativação com senha
  temporária e `must_change_password`. É desenho do produto, não regressão.
- Convites de empresa e `admin-resend-confirmation` operam sobre usuário já existente
  (`admin-resend-confirmation` recusa quem já tem `email_confirmed_at`).

Nada disso foi alterado.

## 4. Testes adicionados (somente testes)

`src/test/unit/authEmailConfirmation.test.tsx` — 4 verificações, com o cliente de autenticação
simulado (sem rede, sem conta real, sem e-mail):

1. Resposta com usuário e **sessão nula** → `needsEmailConfirmation = true`, `alreadyRegistered = false`.
2. Resposta **com sessão** → `needsEmailConfirmation = false` (não trava o caminho legítimo).
3. Resposta de e-mail já cadastrado (identities vazio) → tratada como duplicidade, **não** como
   confirmação pendente.
4. Tela de cadastro renderizada de verdade: ao concluir o cadastro com sessão nula, aparece a etapa
   "Confirme seu e-mail" e **`navigate` não é chamado** (nenhuma entrada em onboarding/hub).

Resultado: 4/4 passando. Também reexecutados, verdes: `src/routes/protectedRouteAuth.test.tsx`
(2 testes — sem sessão, rota privada redireciona para `/auth` e não renderiza o conteúdo) e
`src/test/unit/authSignupSignals.test.ts` (5 testes). Tipagem limpa.

## 5. Limites

- A recusa de login para e-mail não confirmado é feita pelo serviço de contas; isso foi verificado
  pela configuração efetiva e pela leitura do código, **não** por uma tentativa de login real (exigiria
  criar conta e não confirmar).
- O envio e a chegada do e-mail de confirmação não foram testados aqui: nenhum e-mail foi disparado.
- Os testes usam simulação do cliente de autenticação; não substituem um teste de ponta a ponta com
  conta descartável.
- Frontend **não publicado**: os testes novos entram no repositório, sem mudança de comportamento.
