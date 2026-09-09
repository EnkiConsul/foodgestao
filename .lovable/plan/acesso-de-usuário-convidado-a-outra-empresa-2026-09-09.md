# Acesso de usuário convidado a outra empresa

## O que está acontecendo hoje

Verifiquei no banco:

- O usuário `rafael.gyn.castro@gmail.com` **não é dono de nenhuma empresa** e **não é membro de nenhuma**.
- Existe **um convite pendente** para ele na empresa **Raptor** (criado em 09/09, válido até 16/09), com papel de membro. O convite nunca foi aceito.
- A assinatura pessoal desse usuário está **cancelada**.

Como o sistema hoje decide o bloqueio olhando só a assinatura da própria pessoa, ele cai direto na tela "assinatura cancelada". E como o convite só pode ser aceito abrindo o link do e-mail, ele não tem nenhum caminho dentro do sistema para entrar na Raptor.

## Como deve funcionar

1. **Quem paga é o dono da empresa.** O convidado passa a ser liberado nas empresas em que foi aceito, olhando a assinatura do dono daquela empresa, não a dele.
2. **Convite aparece automaticamente e pelo link.** Ao entrar, a pessoa vê os convites pendentes do e-mail dela e aceita com um clique; o link do e-mail continua funcionando como hoje.
3. **Sem empresa e sem convite aceito**, em vez da tela de assinatura cancelada, ela vê uma tela de boas-vindas com: convites pendentes para aceitar e a opção de criar a própria empresa.
4. Quem tem empresa própria continua sujeito à própria assinatura, como hoje.

## O que muda na prática

- Nova tela de entrada para quem não tem empresa: lista de convites pendentes + "Criar minha empresa".
- Aviso de convites pendentes ao fazer login (e no menu, enquanto houver convite).
- Depois de aceitar, a empresa já aparece no seletor e a pessoa entra nela normalmente.
- Ao criar conta a partir do link do convite, o convite é aceito automaticamente após o cadastro/login, sem precisar reabrir o e-mail.
- Bloqueio de assinatura passa a considerar a empresa selecionada: se o dono está em dia, o convidado trabalha; se o dono está inadimplente/cancelado, aparece o aviso de assinatura daquela empresa (sem oferecer pagamento a quem não é dono).

## Detalhes técnicos

- `useCurrentSubscription` continua para o dono; criar `useEffectiveAccess` que resolve, para a empresa selecionada em `useCompanyContext`, a assinatura do `companies.user_id` (owner) via função `SECURITY DEFINER` (`public.company_access_status(company_id)`) retornando status/trial sem expor dados de cobrança do dono.
- `SubscriptionGuard` (src/App.tsx) passa a usar esse status: bloqueia por empresa, não por usuário; quando o usuário não é dono, redireciona para uma tela informativa (sem CTA de pagamento) em vez de `/trial-expirado`.
- Novo hook `usePendingInvites` lendo `company_invites` por e-mail do usuário autenticado (`status = 'pending'` e `expires_at > now()`), com política RLS de leitura própria por e-mail (`lower(invited_email) = lower(auth.jwt()->>'email')`) e GRANT de SELECT para `authenticated`.
- Nova rota `/bem-vindo`: lista convites pendentes (aceitar chama a edge function `accept-invite` existente) e botão para `/onboarding`. `resolveLandingTarget` (src/lib/auth/landing.ts) direciona para lá quando não há empresa própria nem vínculo.
- `Auth.tsx` passa a consumir `sessionStorage.invite_token` após login/cadastro, invocando `accept-invite` e navegando para a empresa (hoje o token é salvo em `AcceptInvite.tsx` e nunca reaproveitado).
- Após aceitar, invalidar `["current-subscription"]`, `["company-access"]` e chamar `refreshCompanies()`.
- Whitelist do guard inclui `/bem-vindo` e `/convite`.
