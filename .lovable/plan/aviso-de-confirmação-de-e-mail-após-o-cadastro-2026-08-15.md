# Aviso de confirmação de e-mail após o cadastro

## Objetivo
Depois que o cliente conclui o cadastro em `/auth`, mostrar na tela um aviso claro pedindo que ele abra o e-mail e confirme a conta — em vez de apenas um toast rápido seguido de redirecionamento.

## Comportamento proposto
1. Cadastro concluído com sucesso:
   - Se a conta **precisa de confirmação** (o cadastro não devolve sessão ativa), o card de login/cadastro é substituído por um painel de aviso:
     - Ícone de e-mail + título "Confirme seu e-mail"
     - Texto: "Enviamos um link de confirmação para **email do cliente**. Abra sua caixa de entrada e clique no link para ativar seu acesso."
     - Observação sobre verificar spam/lixo eletrônico.
     - Botão "Reenviar e-mail de confirmação" (com cooldown de 60s e feedback de sucesso/erro).
     - Botão secundário "Voltar ao login".
   - Se a conta **já vem confirmada** (sessão ativa retornada), o fluxo atual continua: segue para `/onboarding`.
2. Ao tentar entrar sem ter confirmado, a mensagem de erro do login passa a orientar explicitamente a confirmar o e-mail (texto amigável em português).

## Detalhes técnicos
- `src/pages/Auth.tsx`:
  - `signUp` passa a retornar/observar se há sessão; novo estado `pendingConfirmationEmail` e novo `mode` visual `"confirm-email"`.
  - Reenvio via `supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin } })`.
  - Mantém os eventos GA4 já existentes (`SignupSuccess`, `LeadGenerated`).
- `src/hooks/useAuth.tsx`: `signUp` retorna também `session`/`needsEmailConfirmation` para o chamador decidir a tela.
- `src/lib/authErrors` (tradução já existente): garantir mensagem para "Email not confirmed".
- Nenhuma mudança de banco, RLS ou Edge Function.

## Fora de escopo
- Personalizar o layout/marca do e-mail de confirmação (templates de auth) — pode ser feito depois, se desejado.
