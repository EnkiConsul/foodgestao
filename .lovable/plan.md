# D5 — Incentivar a verificação em duas etapas (2FA)

A verificação em duas etapas continua **opcional**: ninguém é bloqueado. O que muda é que o sistema passa a convidar ativamente para ativar, com um prazo de 30 dias apenas como recomendação visível.

## O que o usuário vai ver

1. **Convite no cadastro inicial**: depois de escolher os módulos, uma tela final "Proteja sua conta" explica o risco (conta ligada ao Open Finance) e oferece "Ativar agora" (abre a ativação com QR Code) ou "Deixar para depois". Quem pular conclui o cadastro normalmente.
2. **Aviso fixo no topo** (para quem está sem 2FA): "Sua conta ainda não tem verificação em duas etapas. Ativar leva 2 minutos." Com botão "Ativar agora" e "Lembrar depois" (silencia por 7 dias).
   - Dentro dos 30 dias: aviso em tom informativo, com contagem ("faltam X dias para o prazo recomendado").
   - Passados os 30 dias: mesmo aviso em tom de alerta, sem contagem e sem esconder — só desaparece quando o 2FA é ativado. Continua sem bloquear nada.
3. **Destaque para Dono e Administrador**: para esses papéis o texto reforça que a conta tem acesso financeiro e às conexões bancárias; para os demais, texto padrão.
4. **Nas Configurações**: o cartão de 2FA ganha um selo de estado ("Recomendado — sua conta está sem 2FA" / "Ativo") e explicação curta do porquê.
5. **Portal do colaborador**: nada muda (sem acesso financeiro).

## Detalhes técnicos

- **Estado por usuário**: nova migração adicionando a `auth_user_security_state` as colunas `mfa_nudge_first_seen_at timestamptz`, `mfa_nudge_snoozed_until timestamptz`, `mfa_nudge_dismissed_count int not null default 0`. Sem tabela nova, sem alterar colunas existentes; RLS e grants já existentes da tabela cobrem o acesso do próprio usuário (conferir e, se faltar, permitir apenas UPDATE das novas colunas pelo próprio `user_id`). Migração reversível.
- **Marco dos 30 dias**: `mfa_nudge_first_seen_at` é gravado na primeira vez que o aviso aparece (por RPC `fn_mfa_nudge_registrar`, `security definer`, idempotente — nunca sobrescreve valor já existente). O prazo é `first_seen_at + 30 dias`, calculado no servidor pela mesma RPC, nunca no relógio do navegador.
- **"Lembrar depois"**: RPC `fn_mfa_nudge_adiar` grava `mfa_nudge_snoozed_until = now() + 7 dias` e incrementa o contador; depois do prazo de 30 dias o adiamento não esconde mais o aviso.
- **Novo hook** `src/hooks/useMfaNudge.ts`: usa `supabase.auth.mfa.listFactors()` para saber se há fator verificado, lê o estado pela RPC, e devolve `{ precisaAtivar, prazoEm, venceu, papelFinanceiro, adiar, recarregar }`. Papel vem de `company_members.role` (`owner`/`admin`) na empresa em uso.
- **Novo componente** `src/components/security/MfaNudgeBanner.tsx`, renderizado no layout autenticado (acima do conteúdo, junto do `AmbienteBanner`), nunca em `/auth`, `/onboarding` nem no portal do colaborador.
- **Ativação reaproveitada**: `MfaEnrollRequired.tsx` (hoje sem uso) passa a ser o conteúdo do diálogo de ativação usado pelo banner e pela etapa do onboarding, sem duplicar o fluxo do `TwoFactorCard.tsx`.
- **Onboarding**: nova etapa final opcional em `src/components/onboarding/food/` + ajuste do fluxo em `src/pages/Onboarding.tsx`. Pular não registra pendência nem bloqueia; a conclusão do cadastro continua igual.
- **Auditoria**: cada ativação, adiamento e dispensa grava em `audit_logs` via as RPCs (`mfa_ativado`, `mfa_nudge_adiado`), sem dados sensíveis.
- **Acessibilidade e idioma**: banner com `role="status"` (informativo) / `role="alert"` (após o prazo), botões com nome acessível; textos em Primeira Maiúscula.
- **Testes**: unitários para o cálculo do estado do aviso (sem 2FA dentro do prazo, adiado, prazo vencido ignora adiamento, com 2FA nunca aparece, papel financeiro muda o texto), idempotência da RPC de primeiro registro, e teste de renderização do banner (aparece/desaparece, não aparece em rotas públicas).

## Fora do escopo

- Nenhum bloqueio de acesso, nenhuma obrigatoriedade por papel.
- Nada é publicado em produção; a migração é aplicada apenas após sua aprovação.
