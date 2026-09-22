# Fase 3 — Revogação de Acesso no Portal (P0/P1)

## Diagnóstico confirmado (leitura de código e banco)

1. **Bloqueio pode ser desfeito por link antigo (P0).** Quando o colaborador cria a senha pelo link de uso único, o sistema grava "acesso liberado" sem conferir a situação atual. Quem recebeu um link antes de ser bloqueado consegue voltar a entrar sozinho, sem o DP autorizar.
2. **"Redefinir acesso" funciona para quem está bloqueado ou desligado (P0).** A função que gera o link não verifica bloqueio nem desligamento; só confere que quem pediu é administrador da empresa.
3. **Desligar não revoga nada na hora (P1).** Ao registrar o desligamento, os links pendentes continuam válidos e as sessões abertas não são encerradas. A verificação central do portal reage, mas o acesso não é cortado ativamente.
4. **Desligado dentro do prazo consegue registrar ocorrência (P1).** O prazo pós-desligamento deveria ser só consulta e download de documentos, porém o registro de ocorrência aceita quem está no prazo, não apenas quem está ativo.
5. **Situação atual dos dados:** nenhum link pendente de pessoa bloqueada ou desligada e nenhum desligado com login ativo hoje — o risco é estrutural, não há incidente em curso.

## O que será feito

### Banco (migration isolada da fase)
- Verificação central única de "pode receber/usar acesso": nega bloqueado, desligado com prazo vencido, colaborador excluído e empresa inativa.
- Rotina de servidor para revogar acesso: invalida todos os links pendentes, marca as sessões como revogadas e registra o evento em auditoria — chamada automaticamente quando o vínculo é encerrado ou inativado (gatilho no cadastro do colaborador).
- Registro de ocorrência passa a exigir colaborador ativo (o desligado no prazo continua só consultando documentos).
- Rollback comentado ao final da migration, como nas fases anteriores.

### Funções de servidor
- Criar acesso e redefinir acesso: recusam com mensagem de negócio quando o acesso está bloqueado ou o vínculo está encerrado; para reativar, o DP usa "Reativar acesso" explicitamente.
- Definir senha pelo link: nunca mais desfaz o bloqueio. Se o acesso estiver bloqueado ou o vínculo encerrado, o link é recusado e devolvido ao estado usado, com auditoria.
- Bloquear acesso: passa a usar a mesma rotina de revogação (links + sessões + auditoria em uma única operação, idempotente).

### Tela
- Aba "Acesso ao portal": quando o vínculo está encerrado ou o acesso bloqueado, os botões de liberar/redefinir ficam indisponíveis com explicação curta; a reativação segue no botão próprio.
- Painel de desligamento: a lista "O que acontece ao confirmar" passa a informar que os links pendentes deixam de valer e as sessões abertas são encerradas.
- Mensagens em linguagem de negócio, sem detalhe técnico.

## Testes desta fase
- Bloqueado não consegue reativar pelo link antigo; link é recusado.
- Bloqueado e desligado não recebem novo link de ativação nem de redefinição.
- Ao desligar: links pendentes invalidados, sessões marcadas como revogadas, evento em auditoria.
- Desligado no prazo: lê e baixa documentos; não registra ocorrência, não cria pedidos.
- Desligado com prazo vencido: portal nega tudo.
- Empresa A não bloqueia, libera nem revoga colaborador da Empresa B.
- Dupla execução da revogação não duplica evento nem falha (idempotência).
- Suíte completa, tipos, padrão de código e verificação das funções de servidor alteradas.

## Detalhes técnicos
- Migration nova com `private.dp_acesso_liberavel(user_id)` e `public.dp_portal_acesso_revogar(colaborador_id, motivo)` (SECURITY DEFINER, advisory lock, idempotente), gatilho `AFTER UPDATE OF ativo, data_desligamento, deleted_at` em `dp_colaboradores`, grants restritos a `authenticated` + `service_role`.
- `dp_ocorrencia_registrar` passa a usar `dp_colaborador_ativo_of`.
- Edge Functions alteradas: `dp-criar-acesso-colaborador`, `dp-reset-password`, `dp-alterar-senha-colaborador`, `dp-bloquear-acesso-colaborador`; helper compartilhado em `_shared/portal-access.ts`.
- Frontend: `ColaboradorAcessoPanel.tsx`, `ColaboradorDesligamentoPanel.tsx`; `src/integrations/supabase/types.ts` atualizado se o schema mudar.
- Nenhuma alteração no módulo financeiro. Nada é apagado: revogação é sempre marcação, com histórico preservado.

Parar ao final da Fase 3, com relatório no formato obrigatório.
