# Distribuir folgas de um mês já em andamento

## Por que setembro ficou sem folgas automáticas

O período mensal de escolha está ligado nas duas unidades (abre dia 10, encerra dia 20) e a distribuição automática está ligada. A rotina diária existe e está ativa (roda todo dia de madrugada).

Só que ela sempre trabalha com o **mês seguinte**: enquanto estamos em setembro, o período de escolha aberto é o de outubro, e a distribuição automática de outubro só roda depois do encerramento, a partir de 21/09. A distribuição de setembro teria acontecido entre 21 e 31 de agosto — antes de o recurso existir. Por isso não há nenhum registro de execução até hoje: em setembro, de 10 pessoas ativas, apenas 1 tem folga registrada.

Ou seja: não é uma falha da rotina, é um mês que ficou de fora porque o recurso passou a valer depois dele. A partir de outubro a distribuição acontece sozinha.

## O que vou construir

Uma ação manual para o gestor rodar a distribuição de qualquer mês, inclusive o mês corrente:

- No calendário de folgas (Pessoas > Folgas), botão **"Distribuir folgas automaticamente"**, visível apenas para administradores.
- Ao clicar, uma confirmação mostra o mês escolhido (por padrão o mês que está sendo visualizado), quantas pessoas ainda estão sem folga naquele mês e quantas folgas serão criadas.
- Ao confirmar, o sistema aplica a mesma lógica já usada no fechamento automático: dias de descanso negociados, limites por dia/cargo, pessoas que não folgam juntas, prioridade para os dias mais vazios e, quando tudo estiver lotado, começando pelos últimos dias do mês.
- Quem já tem folga no mês não é tocado; rodar duas vezes não duplica nada.
- Se alguma folga precisar passar do limite do dia, o aviso que já aparece no topo do calendário continua listando os casos para revisão.
- Ao final, mensagem com quantas folgas foram criadas, quantas ficaram acima do limite e quem ficou sem dia disponível.

## Detalhes técnicos

- A rotina `dp_folga_autoatribuir_competencia` já existe e faz todo o trabalho, mas hoje só pode ser executada pelo processo interno. Nova migration (a partir da última existente) cria uma RPC de invocação manual que valida ser administrador da empresa via `has_role`/acesso à empresa, aceita `competencia` livre (mês corrente permitido), registra em `dp_folga_autoatribuicao_execucoes` com marcação de execução manual e chama a rotina existente. `GRANT EXECUTE` apenas para `authenticated` na nova RPC.
- Helper de contagem prévia (pessoas ativas sem folga elegível na competência) para a tela de confirmação, sem `as any` no frontend.
- Frontend em `src/pages/dp/DpFolgas.tsx`: botão + diálogo de confirmação, invalidação das queries do calendário e do painel de excedentes.
- Testes: unitário do helper de resumo e teste de banco cobrindo idempotência (segunda execução não gera nada) e recusa para usuário não administrador.
- Verificação com typecheck, lint e vitest reais.
