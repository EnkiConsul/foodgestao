# Fase 3 — Revogação de Acesso no Portal (P0/P1)

## Diagnóstico confirmado (leitura de código e banco)

1. **Bloqueio pode ser desfeito por link antigo (P0).** Quando o colaborador cria a senha pelo link de uso único, o sistema grava "acesso liberado" sem conferir a situação atual. Quem recebeu um link antes de ser bloqueado consegue voltar a entrar sozinho, sem o DP autorizar.
2. **"Redefinir acesso" funciona para quem está bloqueado ou desligado (P0).** A função que gera o link não verifica bloqueio nem desligamento; só confere que quem pediu é administrador da empresa.
3. **Desligar não revoga nada na hora (P1).** Ao registrar o desligamento, os links pendentes continuam válidos e as sessões abertas não são encerradas. A verificação central do portal reage, mas o acesso não é cortado ativamente.
4. **Desligado dentro dos 30 dias ainda consegue agir (P1).** A regra é clara: nos 30 dias após o desligamento o portal serve apenas para visualizar e baixar documentos. Hoje o registro de ocorrência de ponto aceita quem está nesse prazo, não apenas quem está ativo, e é preciso varrer todos os caminhos de escrita do portal (folga, férias, troca, convocação, pedidos, comentários, aceites) para garantir a mesma regra em todos.
5. **Situação atual dos dados:** nenhum link pendente de pessoa bloqueada ou desligada e nenhum desligado com login ativo hoje — o risco é estrutural, não há incidente em curso.

## O que será feito

### Banco (migration isolada da fase)
- Verificação central única de "pode receber/usar acesso": nega bloqueado, desligado com prazo vencido, colaborador excluído e empresa inativa.
- Rotina de servidor para revogar acesso: invalida todos os links pendentes, marca as sessões como revogadas e registra o evento em auditoria — chamada automaticamente quando o vínculo é encerrado ou inativado (gatilho no cadastro do colaborador).
- Regra dos 30 dias somente leitura aplicada no servidor em todos os caminhos: nos 30 dias após o desligamento o colaborador só visualiza e baixa documentos; folga, férias, troca, convocação, ocorrência de ponto, pedidos ao DP e comentários passam a exigir vínculo ativo. Auditoria de cada caminho de escrita do portal antes da correção, para não sobrar exceção.
- Rollback comentado ao final da migration, como nas fases anteriores.

### Funções de servidor
- Criar acesso e redefinir acesso: recusam com mensagem de negócio quando o acesso está bloqueado ou o vínculo está encerrado; para reativar, o DP usa "Reativar acesso" explicitamente.
- Definir senha pelo link: nunca mais desfaz o bloqueio. Se o acesso estiver bloqueado ou o vínculo encerrado, o link é recusado e devolvido ao estado usado, com auditoria.
- Bloquear acesso: passa a usar a mesma rotina de revogação (links + sessões + auditoria em uma única operação, idempotente).

### Tela
- Aba "Acesso ao portal": quando o vínculo está encerrado ou o acesso bloqueado, os botões de liberar/redefinir ficam indisponíveis com explicação curta; a reativação segue no botão próprio.
- Painel de desligamento: a lista "O que acontece ao confirmar" passa a informar que os links pendentes deixam de valer, as sessões abertas são encerradas e o portal fica apenas para consulta e download de documentos por 30 dias.
- Portal do colaborador desligado: aviso fixo "Seu acesso está apenas para consulta e download de documentos" e ações de escrita ocultas nas telas do portal.
- Mensagens em linguagem de negócio, sem detalhe técnico.

## Testes desta fase
- Bloqueado não consegue reativar pelo link antigo; link é recusado.
- Bloqueado e desligado não recebem novo link de ativação nem de redefinição.
- Ao desligar: links pendentes invalidados, sessões marcadas como revogadas, evento em auditoria.
- Desligado nos 30 dias: lê e baixa os próprios documentos; negado em folga, férias, troca, convocação, ocorrência de ponto, pedidos ao DP e comentários — um teste por caminho.
- Desligado com prazo vencido: portal nega tudo.
- Empresa A não bloqueia, libera nem revoga colaborador da Empresa B.
- Dupla execução da revogação não duplica evento nem falha (idempotência).
- Suíte completa, tipos, padrão de código e verificação das funções de servidor alteradas.

## Detalhes técnicos
- Migration nova com `private.dp_acesso_liberavel(user_id)` e `public.dp_portal_acesso_revogar(colaborador_id, motivo)` (SECURITY DEFINER, advisory lock, idempotente), gatilho `AFTER UPDATE OF ativo, data_desligamento, deleted_at` em `dp_colaboradores`, grants restritos a `authenticated` + `service_role`.
- `dp_ocorrencia_registrar` passa a usar `dp_colaborador_ativo_of`; varredura de todas as policies de escrita e RPCs do portal que hoje aceitam `dp_colaborador_of`/`is_dp_colaborador_of_company` (que incluem `desligado_no_prazo`) para trocar por `private.dp_pode_agir`, mantendo leitura/download de documentos com o escopo atual.
- Edge Functions alteradas: `dp-criar-acesso-colaborador`, `dp-reset-password`, `dp-alterar-senha-colaborador`, `dp-bloquear-acesso-colaborador`; helper compartilhado em `_shared/portal-access.ts`.
- Frontend: `ColaboradorAcessoPanel.tsx`, `ColaboradorDesligamentoPanel.tsx`; `src/integrations/supabase/types.ts` atualizado se o schema mudar.
- Nenhuma alteração no módulo financeiro. Nada é apagado: revogação é sempre marcação, com histórico preservado.

Parar ao final da Fase 3, com relatório no formato obrigatório.
