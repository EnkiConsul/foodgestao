# Trocar a folga de domingo para sábado (caso da Hanna)

## O que eu encontrei no sistema

- O pedido de folga da Hanna para **domingo 20/09** está como **aprovado**, mas **nenhuma folga foi criada** para esse dia. Ou seja: o dia aprovado nunca apareceu como folga dela no calendário.
- A única folga futura dela é **sábado 31/10**, criada automaticamente pelo sistema no fechamento do período.
- Hoje o portal só deixa o colaborador apagar folga que **ele mesmo** marcou. Folga criada pelo DP ou pelo sistema não pode ser removida por ele — então não havia caminho para sair do domingo e ir para o sábado.
- Marcar outro dia de fim de semana também seria recusado: já existe folga de fim de semana no mês (limite de 1) e, fora do período de escolha (dia 10 ao 20), o portal manda "solicitar exceção".
- O botão "Trocar" só aparece quando **um colega já está de folga** naquele dia; sem colega de folga no sábado, não havia botão nenhum.

Resumo: ela não conseguiu porque não existe hoje a ação "mudar a minha folga de dia", e o pedido aprovado dela não virou folga.

## O que vai mudar

### 1. Botão "Mudar o dia da minha folga"
Na janela do dia em que a pessoa tem folga marcada, além de "Remover folga", entra **"Mudar o dia da minha folga"**:

- Ela escolhe o novo dia de fim de semana (sábado ou domingo) dentro do mesmo mês.
- Vale para folga marcada por ela, marcada pelo DP ou criada automaticamente pelo sistema.
- Vale enquanto a data antiga e a nova ainda não passaram, mesmo fora do período de escolha.
- A mudança é feita de uma vez: sai do dia antigo e entra no novo; se o novo dia não puder receber, nada é alterado e ela vê o motivo.
- O limite de 1 folga de fim de semana no mês continua valendo — a folga é movida, não somada.

### 2. Quando o dia desejado não está disponível
Se o novo dia estiver lotado (limite de pessoas em folga), bloqueado pelo DP, com conflito de dupla ou com prazo já vencido, o botão vira **"Pedir mudança ao DP"**: entra como solicitação com o dia atual e o dia desejado, e o DP aprova ou recusa. Mensagem clara do motivo em cada caso.

### 3. O gestor é sempre avisado
Toda mudança feita pelo colaborador gera:
- aviso para o DP/gestor da unidade (notificação), com nome, dia antigo, dia novo e motivo informado;
- registro no histórico/auditoria;
- destaque da mudança na tela de Folgas do DP, para o gestor conferir a escala.

### 4. Corrigir o pedido aprovado que não virou folga
- Ao aprovar um pedido de folga, a folga do dia passa a ser criada na mesma operação (e o pedido volta a ficar pendente se a criação falhar, com o motivo).
- Levanto os pedidos já aprovados sem folga correspondente e apresento a lista para você decidir caso a caso (nada é criado ou apagado sem sua autorização).

## Detalhes técnicos

- Nova RPC `dp_folga_remarcar(p_data_atual, p_data_nova, p_motivo)`: transacional, com `pg_advisory_xact_lock` nas duas datas, revalidando data passada, fim de semana, janela dispensada para remarcação, bloqueios, `dp_folga_limite_dia`, `dp_folga_conflito_colaboradores` e limite mensal contando a folga antiga como liberada. Erros nomeados (`FOLGA_REMARCAR_LIMITE_DIA`, `FOLGA_REMARCAR_BLOQUEADA`, `FOLGA_REMARCAR_CONFLITO`, `PAST_DATE_NOT_EDITABLE`) para o portal traduzir. Permite mover folgas de origem `solicitacao`, `admin_manual`, `auto_fechamento_periodo` e `automatica_clt` apenas quando a nova data continua sendo dia de descanso válido pela regra da unidade; grants só para `authenticated`.
- Auditoria via `audit_row_change`/`dp_regras_historico` conforme padrão de DP, e notificação em `dp_notificacoes` para os administradores da unidade.
- Ao aprovar solicitação de folga: ajustar `dp_solicitacao_responder` para inserir a folga na mesma transação (idempotente por `colaborador_id + data`), mantendo os bloqueios existentes.
- Frontend: `src/pages/dp/portal/DpMeuCalendario.tsx` (novo diálogo de remarcação, lista de dias possíveis do mês, fallback para pedido ao DP), mensagens em `src/lib/dp/trocas-erros.ts` ou helper novo, e nova função pura em `src/lib/dp/` para calcular os dias elegíveis (testável).
- Testes: unitários dos dias elegíveis e das mensagens; teste SQL da RPC (move com sucesso, recusa dia lotado sem perder a folga antiga, recusa data passada, idempotência) e teste RLS de que ninguém remarca folga de outra pessoa.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json` e `bunx vitest run` nos testes tocados.

## Fora do escopo

- Trocar folga com colega (fluxo de troca atual segue como está).
- Mudança de folga em datas passadas e alteração das regras de DSR/limites por dia.
