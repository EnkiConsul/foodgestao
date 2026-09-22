# Fase 2 — Solicitações e Estados Administrativos (P0/P1)

Módulo: Pessoas 360°. O módulo financeiro não é alterado nesta fase.

## Diagnóstico confirmado (leitura de código e banco)

1. **Tela de Atestados altera e apaga solicitações direto do navegador.**
   `src/pages/dp/DpAtestados.tsx` executa `update` em `dp_solicitacoes` trocando colaborador, datas e observação, e `delete` para excluir o atestado (apagando antes o arquivo no Storage). As políticas atuais permitem `UPDATE` e `DELETE` livres para administradores, e a validação de solicitação só roda em `BEFORE INSERT`. Consequências reais: um atestado já aprovado pode ser movido para outro colaborador, ter as datas alteradas sem revalidação, e ser apagado do histórico; o arquivo é removido fora da transação, então uma falha deixa registro sem arquivo.
2. **Decisão de aprovar/recusar pode ser feita por fora da rotina oficial.** Existe `dp_solicitacao_responder` (transacional, com travas, exige administrador da empresa e só aceita pendente → aprovada/recusada), mas a política de `UPDATE` permite gravar `status` direto da tela, sem os efeitos vinculados (criação de folga, troca, limites) e sem a máquina de estados.
3. **Adiantamento salarial é inserido direto pelo navegador.** `AdiantamentoSolicitacoesPanel.tsx` insere em `dp_adiantamento_solicitacoes` enviando empresa, colaborador, tipo, data, `origem` e `criado_por` escolhidos no cliente. O gatilho recalcula a competência apenas quando `origem = 'portal'`; a regra de antecedência do portal só existe em JavaScript, e `origem` é declarada pelo próprio cliente. A política ampla de administrador também permite alterar e apagar o histórico de adiantamentos.
4. **Sem alteração pendente:** `dp_cadastro_solicitacoes` não tem tela ativa hoje (somente auditoria), então nesta fase só recebe reforço de coerência, sem mudança de fluxo.

**Risco:** estado administrativo indevido (decisão sem regra), perda de histórico legal de atestado, atestado atribuído ao colaborador errado, competência de adiantamento manipulada pelo cliente.

## O que será feito

### Banco (migration isolada e reversível)
- Nova rotina única de correção de atestado (`dp_solicitacao_corrigir`): recebe só o necessário, deriva usuário, empresa e colaborador no servidor, exige administrador/dono da empresa, recusa troca de colaborador para outra empresa, revalida datas e período, e grava o motivo da correção.
- Nova rotina de exclusão de atestado/solicitação (`dp_solicitacao_excluir`) com **exclusão lógica** (`removido_em`, `removido_por`, `removido_motivo`): nada é apagado; o arquivo no Storage permanece e a listagem passa a ignorar registros removidos.
- Máquina de estados aplicada no banco: gatilho que impede mudar `status`, `colaborador_id`, `company_id`, `tipo`, datas e arquivo por `UPDATE` direto — somente pelas rotinas oficiais (`dp_solicitacao_responder`, `dp_solicitacao_cancelar`, as duas novas e as rotinas de férias).
- Retirada das gravações livres do cliente: `UPDATE`/`DELETE` de `dp_solicitacoes` e `INSERT`/`UPDATE`/`DELETE` de `dp_adiantamento_solicitacoes` deixam de ser feitos pelo aplicativo; passam pelas rotinas com permissão apenas para usuário autenticado.
- Nova rotina de adiantamento (`dp_adiantamento_registrar`): deriva empresa, colaborador e autor no servidor, define `origem` pela permissão real (portal só para o próprio colaborador), aplica a antecedência e a competência no banco, e é idempotente por colaborador + tipo + data.
- Índices de apoio e `GRANT` explícito para `authenticated` e `service_role`; nenhum dado existente é apagado, com backfill apenas das novas colunas nulas.

### Frontend
- `DpAtestados.tsx`: editar, aprovar/recusar e excluir passam a chamar as rotinas do servidor; exclusão apresentada como "Excluir atestado" com motivo, mantendo o registro no histórico.
- `AdiantamentoSolicitacoesPanel.tsx`: registro passa pela rotina única; a mensagem de competência vem da resposta do servidor.
- Listagens de atestados, pendências e portal passam a ignorar registros removidos.
- Mensagens em linguagem de negócio, sem detalhes técnicos: "Esta solicitação já foi respondida.", "Não é possível alterar o atestado de outro colaborador.", "O atestado foi excluído e permanece no histórico."

### Testes (mínimo desta fase)
Solicitação própria criada e respondida; administrador de outra empresa negado em corrigir/excluir/responder; colaborador negado em responder; decisão dupla (duplo clique) não gera dois efeitos; duas sessões respondendo simultaneamente resultam em estado único; `UPDATE`/`DELETE` direto do cliente negados; correção que troca o colaborador para outra empresa negada; exclusão preserva o registro e o arquivo; adiantamento pelo portal com data fora da antecedência negado no servidor; `origem` enviada indevidamente pelo cliente ignorada; registro repetido não duplica.
Além disso: TypeScript, lint, testes completos, build e conferência das consultas de validação no banco.

## Rollback
A migration terá bloco de reversão: remoção das novas rotinas e gatilhos, restauração das políticas anteriores e das colunas de exclusão lógica (mantendo os dados), e o frontend volta ao caminho anterior por revert dos arquivos.

## Fora de escopo
Fases 3 a 10 (revogação de acesso no portal, férias, analytics, convocações, pré-admissão, build, homologação e liberação gradual) e qualquer alteração no módulo financeiro.
