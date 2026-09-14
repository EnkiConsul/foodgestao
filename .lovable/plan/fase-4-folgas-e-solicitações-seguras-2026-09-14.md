# Fase 4 — Folgas e solicitações seguras

Objetivo: as regras de folga passam a ser decididas no servidor, em uma única operação, sem depender do que o navegador envia. O aplicativo continua avisando o colaborador antes de enviar, mas quem decide é o servidor.

## Diagnóstico (verificado no banco e no código)

1. **Existem duas versões da rotina de pedir folga.** A antiga (`dp_folga_solicitar(p_data, p_motivo)`) não verifica o período mensal de escolha nem a regra de colegas que não podem folgar juntos. A nova (`dp_folga_solicitar(p_data, p_motivo, p_fora_da_janela)`) verifica. Como as duas convivem, basta enviar o pedido sem o terceiro campo para cair na antiga e furar o período mensal. A antiga também está liberada para visitante (anon).
2. **O portal grava direto no banco em três pontos:**
   - marcar folga no calendário (grava linha de folga direto);
   - remover folga no calendário (apaga linha direto);
   - criar e cancelar solicitação em "Minhas solicitações" (grava e altera status direto).
   Em todos, as regras críticas (dia bloqueado, teto do mês, lotação, colega incompatível, período de escolha) são conferidas em JavaScript antes do envio — ou seja, fora do controle do servidor.
3. **O que já é protegido no banco:** gatilhos nas duas tabelas conferem data bloqueada, regra de bloqueio, bloqueio individual e limite do dia; as regras de acesso impedem gravar por outra pessoa ou por outra empresa; o bloqueio de conta da Fase 1 continua valendo.
4. **O que falta:** período mensal de escolha não é conferido na gravação direta; a lotação usada no gatilho é mais simples que a regra oficial (não considera reservas e limites por setor/cargo); não há trava contra dois cliques ou duas pessoas disputando a última vaga na gravação direta; cancelar não confere de quem é a solicitação nem o status; a aprovação do gestor é só uma troca de status, sem reconferir lotação e sem impedir duas aprovações ao mesmo tempo; a atribuição rápida do gestor cria a folga já aprovada sem passar pelas mesmas conferências.
5. **Permissões largas:** várias rotinas de folga estão liberadas para visitante (anon), inclusive as de distribuição automática.

## O que será feito

**No servidor (banco)**
- A rotina antiga de pedir folga deixa de existir como caminho paralelo: passa a ser um atalho que chama a rotina segura, sempre com o período mensal valendo.
- Nova rotina para **marcar folga** (a que o calendário do colaborador usa hoje por gravação direta), com todas as conferências numa única operação: vínculo, conta ativa, data futura, período mensal, data bloqueada, bloqueio individual, teto do mês, lotação oficial do dia, colega incompatível e duplicidade.
- Nova rotina para **remover a própria folga** (só folga própria, criada por solicitação, agendada, futura e não obrigatória por lei).
- Nova rotina para **criar solicitação** (folga, atestado e demais tipos) e **cancelar a própria solicitação** (só própria, só quando pendente).
- Nova rotina para **responder solicitação** (aprovar/recusar), que confere papel de gestor da empresa, reconfere a lotação no momento da aprovação e só age se a solicitação ainda estiver pendente.
- Nova rotina para a **atribuição rápida** do gestor, com as mesmas conferências críticas.
- Todas travam a data por concorrência, para que dois cliques não gerem duplicidade e duas pessoas não ocupem a mesma última vaga.
- Identidade sempre derivada da sessão (Fase 3): nada de identificador de colaborador, empresa ou usuário vindo do navegador.
- Permissões mínimas: visitante perde acesso às rotinas de folga; distribuição automática fica só para gestor e servidor.

**No aplicativo**
- Calendário do colaborador, Minhas solicitações, Solicitações (gestão), Folgas (gestão) e o registro de ausência passam a chamar as novas rotinas em vez de gravar direto. As telas e a aparência não mudam; só a forma de enviar.
- As mensagens de erro do servidor continuam traduzidas para o texto amigável que já existe.

**Fora do escopo:** trocas, férias, convocações, escala, reconhecimento de documentos e qualquer mudança visual.

## Detalhes técnicos

- Migration única, sem apagar dados:
  - `CREATE OR REPLACE public.dp_folga_solicitar(date, text)` → wrapper de `dp_folga_solicitar(date, text, boolean)` com `p_fora_da_janela => false`;
  - novas funções `public.dp_folga_marcar(date)`, `public.dp_folga_remover(date)`, `public.dp_solicitacao_criar(dp_solicitacao_tipo, date, date, text)`, `public.dp_solicitacao_cancelar(uuid)`, `public.dp_solicitacao_responder(uuid, dp_solicitacao_status, text)`, `public.dp_folga_atribuir_admin(uuid, date, text)`;
  - todas `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated, service_role`;
  - identidade por `public.dp_meu_colaborador()`; papel por `private.is_company_admin_or_owner(auth.uid(), company_id)`; lotação por `public.dp_folga_limite_dia`; período por `public.dp_folgas_janela_efetiva`; conflito por `public.dp_folga_conflito_colaboradores`;
  - `pg_advisory_xact_lock` por (empresa, unidade, data) na capacidade e por (colaborador, data) na duplicidade; `SELECT ... FOR UPDATE` na solicitação ao responder;
  - `REVOKE EXECUTE ... FROM anon` em `dp_folga_solicitar` (ambas), `dp_folga_limite_dia`, `dp_folgas_janela_efetiva`, `dp_folga_conflito_colaboradores`, `dp_folga_autoatribuicao_plano/previa`, `dp_folga_autoatribuir_aplicar/competencia/manual/todas`, `dp_folga_marcadas_no_mes`, `dp_folga_ocupado_no_dia`, `dp_folga_dias_fds_aplicaveis`;
  - gatilhos atuais preservados como segunda linha de defesa.
- Arquivos previstos: `src/pages/dp/portal/DpMeuCalendario.tsx`, `src/pages/dp/portal/DpMeuSolicitacoes.tsx`, `src/pages/dp/portal/DpMeuDocumentos.tsx` (cancelamento), `src/pages/dp/DpSolicitacoes.tsx`, `src/pages/dp/DpFolgas.tsx`, `src/pages/dp/DpAtestados.tsx`, `src/components/dp/DpRegistrarAusenciaDialog.tsx`.
- Testes novos em `src/test/rls/folgas_solicitacoes.rls.test.ts` cobrindo os 12 casos pedidos (válido, fora da janela, data bloqueada, limite, duplicidade, atuar por outro, empresa errada, conta bloqueada, cancelamento inválido, duas solicitações simultâneas para a última vaga, duas aprovações simultâneas, assinatura antiga sem contornar a regra), com concorrência exercitada por SQL em duas transações.
- Validações: `tsgo --noEmit`, lint, vitest, build, `migrations:check`, `scope-lint`, `security-lint` (baseline 109; espera-se redução pelas permissões de anon removidas). Sem Edge Function nesta fase.
- Rollback: `DROP` das novas funções, restaurar o corpo original da assinatura antiga de `dp_folga_solicitar`, reconceder o EXECUTE anterior e reverter os arquivos do aplicativo. As gravações diretas do portal continuam permitidas pelas regras de acesso, então o rollback do aplicativo funciona sozinho.

Ao final: relatório em 9 itens e parada, sem iniciar a Fase 5.
