# D5 — Aviso opcional para ativar a verificação em duas etapas (2FA)

A verificação em duas etapas continua **opcional e sem prazo**: ninguém é bloqueado e nada expira. O sistema apenas mostra um pop-up informativo convidando a ativar.

## O que o usuário vai ver

1. **Pop-up informativo** (só para quem ainda não tem 2FA ativo), ao entrar no sistema:
   - Título: "Proteja sua conta com verificação em duas etapas".
   - Texto curto explicando que a conta tem acesso financeiro e a conexões bancárias, e que ativar leva cerca de 2 minutos.
   - Botão principal "Ativar agora" → fecha o pop-up e leva para a página de ativação (Configurações, no cartão de verificação em duas etapas, já focado).
   - Botão "Agora não" → fecha; volta a aparecer numa próxima entrada.
   - Caixa de seleção "Não mostrar novamente" → quando marcada e o pop-up fechado, o aviso nunca mais aparece para aquele usuário.
2. Aparece no máximo uma vez por sessão, e nunca nas telas públicas (login, aceitar convite, páginas legais), nem durante o cadastro inicial, nem no portal do colaborador.
3. **Nas Configurações**: o cartão de 2FA ganha uma linha de estado ("Sua conta está sem verificação em duas etapas" / "Ativa") e uma frase curta do porquê ativar. Nenhuma outra mudança de layout.

## Detalhes técnicos

- **Estado por usuário**: migração adicionando a `auth_user_security_state` a coluna `mfa_nudge_opt_out boolean not null default false` (e `mfa_nudge_last_shown_at timestamptz` apenas para não repetir o aviso no mesmo dia). Nenhuma tabela nova, nenhuma coluna existente alterada; migração reversível.
- **Leitura e gravação**: RPC `fn_mfa_nudge_estado()` (`security definer`, `stable`) devolve `{ opt_out, last_shown_at }` do próprio usuário, e `fn_mfa_nudge_registrar(_opt_out boolean)` grava a decisão de forma idempotente (upsert pelo `user_id`, nunca reativa um opt-out já marcado). Grants somente para `authenticated`; sem acesso a outros usuários.
- **Novo hook** `src/hooks/useMfaNudge.ts`: verifica fator verificado com `supabase.auth.mfa.listFactors()`, lê o estado pela RPC e devolve `{ mostrar, fechar(optOut: boolean), ativar() }`. Não mostra nada enquanto a checagem estiver em andamento (fail closed em erro: não mostra).
- **Novo componente** `src/components/security/MfaNudgeDialog.tsx`: `Dialog` do shadcn com `Checkbox` "Não mostrar novamente"; "Ativar agora" navega para `/configuracoes?secao=2fa` (novo parâmetro lido em `src/pages/Configuracoes.tsx` para abrir/rolar até o `TwoFactorCard`).
- **Montagem**: renderizado uma vez no layout autenticado (junto ao `AmbienteBanner`), atrás das mesmas condições de rota descritas acima. `sessionStorage` evita reabrir na mesma aba.
- **Auditoria**: a RPC registra `mfa_nudge_optout` em `audit_logs` quando o usuário escolhe não ver mais; sem dados sensíveis.
- **Acessibilidade e idioma**: diálogo com título e descrição ligados (`aria-labelledby`/`aria-describedby` do componente shadcn), caixa de seleção com rótulo associado, botões com nome acessível; textos em Primeira Maiúscula.
- **Testes**: unitários do hook (sem 2FA → mostra; com 2FA → nunca mostra; opt-out gravado → nunca mostra; erro na checagem → não mostra; "Ativar agora" fecha e navega) e do diálogo (marcar a caixa chama a RPC com `opt_out = true`; "Agora não" não grava opt-out).

## Fora do escopo

- Nenhum prazo, contagem, banner fixo, bloqueio de acesso ou obrigatoriedade por papel.
- Nenhuma mudança no cadastro inicial (onboarding).
- Nada é publicado em produção; a migração é aplicada apenas após sua aprovação.
