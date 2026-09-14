# Fechamento da Fase 1 — pendências críticas do acesso do colaborador

Escopo: apenas as pendências P0.1, P0.2, P0.3, P1.1, P1.2, P1.3 e P1.4. Nada da Fase 2.

## Decisões confirmadas

- O link temporário continua sendo gerado no painel e entregue pelo gestor via WhatsApp ao número cadastrado. Risco de personificação pelo gestor é **aceito conscientemente** e será declarado de forma explícita na tela e no relatório — não será apresentado como impedido.
- Prazos novos: ativação **24 horas**, redefinição **30 minutos**. Ao definir a senha, o link morre na hora.
- CPF não é segredo: passa a servir apenas como confirmação adicional, nunca como chave de localização da conta.
- Bloqueio vale para **qualquer usuário marcado como bloqueado**, inclusive área administrativa.

## O que muda

### 1. Link e identidade pelo token (P0.1 parcial, P1.3, P1.4)
- O código passa a carregar um identificador público do token (`tid`) além do segredo: o link fica `?t=<tid>&c=<codigo>`. O servidor localiza o token pelo identificador, confere o hash do segredo, o prazo e a finalidade, e só então obtém `user_id`, `colaborador_id` e `company_id` **do próprio registro**.
- Fim da busca por CPF em `dp_colaboradores`; o CPF informado é comparado com o colaborador do token (e erros de consulta passam a negar, não a ignorar).
- Finalidade obrigatória: o app envia o propósito esperado e o servidor recusa quando divergir do registro. Link de ativação não serve para redefinição e vice-versa.
- Tela de ativação deixa claro que o link é pessoal e de uso único, e alerta o colaborador a trocar a senha se suspeitar que alguém mais viu o link.

### 2. Fail closed no portal (P0.2)
- `PortalProtected` passa a liberar somente com resposta explícita `true`. Erro de rede/consulta e resultado nulo passam a negar, com tela de aviso e botão de tentar novamente, sem encerrar a sessão por engano.

### 3. Bloqueio efetivo no backend (P0.3)
- Nova função central de verificação de bloqueio, usada dentro dos auxiliares que já sustentam as regras de acesso do banco (`is_company_member`, `is_company_admin_or_owner`, `is_dp_colaborador_of_company`, `dp_colaborador_of`, `dp_colaborador_ativo_of`). Com isso, usuário bloqueado deixa de ler, gravar ou baixar dados por qualquer caminho: tabelas, RPCs do portal, arquivos e funções de servidor — inclusive de outro aparelho com sessão antiga.
- Ao bloquear: tokens pendentes invalidados, tentativa de revogar as sessões pelo mecanismo oficial de autenticação e registro em auditoria. Mesmo que o token de sessão continue tecnicamente válido por alguns minutos, o banco já nega tudo.

### 4. Limite de tentativas persistente (P1.1)
- Remoção do contador em memória; passa a usar o mecanismo compartilhado já existente no projeto (tabela de limites por janela de tempo), com limite por IP e por token, bloqueio temporário e expiração natural da janela. Nada de senha nem código puro armazenado.

### 5. Token não se perde por falha intermediária (P1.2)
- Consumo em duas etapas: reserva exclusiva do token (garante que dois pedidos simultâneos não usem o mesmo), troca da senha e só então marcação definitiva de consumido. Se a troca falhar, a reserva é liberada e o colaborador pode tentar de novo com o mesmo link; reservas abandonadas expiram sozinhas.

## Detalhes técnicos

- **Migrations**: colunas `claimed_at`/`claim_expires_at` em `dp_portal_access_tokens`; RPC de reserva/confirmação/liberação em SECURITY DEFINER com `search_path` fixo e EXECUTE só para service_role; `private.dp_access_enabled(uuid)` e sua aplicação nos auxiliares citados; ajuste de `auth_access_enabled` para continuar coerente. A migration de disciplinares `20260914051131_...` é preservada.
- **Edge Functions**: `_shared/portal-access.ts` (tid, prazos 24h/30min, claim/confirm/release, purpose obrigatório), `dp-criar-acesso-colaborador`, `dp-reset-password`, `dp-alterar-senha-colaborador` (rate limit persistente, identidade pelo token, CPF só confirmação), `dp-bloquear-acesso-colaborador` (revogação de sessões).
- **Frontend**: `src/App.tsx` (fail closed + aviso), `src/pages/AtivarAcesso.tsx` (tid, purpose explícito, aviso de link pessoal), `src/components/dp/ColaboradorAcessoPanel.tsx` (prazos novos e aviso de risco residual).
- **Testes** (17 casos pedidos): purpose cruzado, token expirado, token já usado, CPF de outro colaborador, concorrência no mesmo token, falha na troca de senha sem perder o token, limite de tentativas persistente, negação com erro/nulo na verificação de acesso, bloqueado sem leitura de dados pessoais/arquivo/RPC/em outro dispositivo, ausência de senha em respostas e logs. Inclui testes de multiempresa.
- **Validações**: TypeScript strict, lint, testes, build, `deno check` nas funções alteradas, validação de migrations, security-lint, scope-lint. Problemas preexistentes (110 apontamentos anteriores, alvo das fases 2 e 4) serão informados à parte.
- **Rollback**: reverter os arquivos listados e, no banco, remover as colunas/RPCs novas e restaurar os auxiliares na versão anterior.

## Entrega

Ao final, relatório nos 15 itens solicitados e parada. A Fase 2 não será iniciada.
