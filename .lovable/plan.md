# Folgas: data já sugerida, registrar ausência na Operação e remarcar/cancelar

## 1. A data sugerida não aparece na janela "Gerar Folgas"

O sistema **calcula** a data (para o Nordman, 05/09), mas a caixa de data aparece vazia: a lista de dias oferecida na janela é montada com os dias de descanso da configuração geral da empresa (só domingo), enquanto a data sugerida vem da regra da unidade dele (sábado e domingo). Como 05/09 é sábado, o dia sugerido não está entre as opções e a caixa fica em branco.

Correção: a janela passa a montar as opções de dia por pessoa, usando os dias de descanso da unidade de cada colaborador. Assim a data sugerida aparece já preenchida e as alternativas oferecidas são as que valem para aquela pessoa.

## 2. Ordem de preferência da data sugerida

Hoje o sistema varre o mês do começo para o fim e fica no primeiro dia livre. Passa a escolher nesta ordem:

1. dias sem ninguém em folga, começando pelos **últimos dias do mês**;
2. se todos já têm alguém, o dia com **menos gente** em folga, também dando preferência ao fim do mês.

**Se tudo estiver no limite, o sistema não sugere nenhum dia**: a pessoa fica marcada como "Acima do limite" e o gestor escolhe o dia manualmente entre **todos os dias possíveis** para ela, vendo ao lado de cada data **quantas pessoas já folgam naquele dia** — e pode confirmar assim mesmo, assumindo o excesso.

Continuam valendo os limites por dia e cargo, os bloqueios de data e as regras de quem não pode folgar junto.

## 3. "Nova solicitação" sai das Folgas e vira "Registrar Ausência" na Operação

- O botão sai do topo do Calendário de Folgas (o atalho "Solicitar ausência avançada" dentro do dia continua, apontando para a nova tela).
- Na tela **Operação** aparece o botão **Registrar Ausência**, com colaborador, tipo (folga, atestado, férias, outros), datas e observação.
- A ausência registrada pelo gestor entra **já efetiva** (não fica pendente de aprovação): quando o tipo é folga, ela aparece imediatamente nos cards de folga do dia na Operação e no Calendário de Folgas; atestado aparece no card de atestados.

## 4. Remarcar ou cancelar a folga de um colaborador

No dia aberto do Calendário de Folgas, cada folga da lista passa a ter duas ações:

- **Remarcar** — escolher outra data (respeitando os dias de descanso válidos, o limite do dia e os bloqueios);
- **Cancelar** — pede uma justificativa curta e marca a folga como cancelada, mantendo o histórico. O dia cancelado **deixa de aparecer** no calendário com o nome do colaborador.

O botão de lixeira (que apagava o registro) sai de cena.

## Detalhes técnicos

- Nova migration (a partir da última existente) para `dp_folga_autoatribuicao_plano`, `dp_folga_autoatribuir_competencia` e `dp_folga_autoatribuicao_previa`:
  - varredura de candidatos com `ORDER BY d DESC` e escolha do dia de menor ocupação com desempate pela data mais tarde;
  - **sem contingência acima do limite**: quando todos os dias possíveis já estão no limite, o item sai com `data_sugerida = null`, `excede_limite = true` e motivo `ACIMA_DO_LIMITE` (a criação automática não insere nada nesses casos);
  - cada item do JSON passa a trazer `dias` (dias de descanso resolvidos pela unidade do colaborador) e `ocupacao` (mapa data → quantidade de folgantes), junto de `data_sugerida`; a chave `dias` do topo continua para compatibilidade.
- `src/lib/dp/folga-autoatribuicao.ts`: `PlanoItem` ganha `dias: number[]` e `ocupacao: Record<string, number>`; novo helper `diasEscolhaDoItem(competencia, item, diasTopo)`; texto do resumo para o caso "só acima do limite" orientando a escolha manual.
- `src/pages/dp/DpFolgas.tsx`: nas linhas "Acima do limite", o `Select` de data lista **todas** as datas válidas da pessoa com o rótulo `DD/MM · N folgando`; a confirmação da geração inclui os itens acima do limite **somente quando o gestor escolheu uma data** (a RPC de aplicação já recebe data por item).
- `src/pages/dp/DpFolgas.tsx`:
  - opções do `Select` de cada linha vindas de `diasEscolhaDoItem` (fim de `diasEscolhaAuto` global);
  - remoção do botão "Nova solicitação", do diálogo `dialogOpen`, do estado `form` e da mutation `create` (o atalho no dia navega para `/dp/operacao?ausencia=<data>`);
  - troca do `removerFolga` (delete) por `cancelarFolga` (`UPDATE dp_folgas SET status='cancelada', observacao=<justificativa>`) e `remarcarFolga` (`UPDATE dp_folgas SET data=<nova>`), ambas com invalidação de `dp_folgas`/`dp_folgas_efetivadas`; para eventos vindos de `dp_solicitacoes` aprovadas, cancelar grava `status='cancelada'` na solicitação (a consulta já exclui canceladas).
- `src/pages/dp/DpOperacaoPanorama.tsx` + novo `src/components/dp/DpRegistrarAusenciaDialog.tsx`: botão em `DpPageHeader`, abertura automática via `?ausencia=<data>`; grava folga em `dp_folgas` (`origem='admin_manual'`, `status='agendada'`) e demais tipos em `dp_solicitacoes` com `status='aprovada'`; invalida as chaves do panorama.
- `useDpOperacaoPanorama` passa a ler `dp_solicitacoes` de tipos `atestado` e `outros` aprovados (hoje só `atestado`).
- Testes: casos novos em `supabase/tests/dp_folga_autoatribuir_aplicar.test.sql` (preferência pelo fim do mês, `dias`/`ocupacao` por item e item `ACIMA_DO_LIMITE` sem criação automática), unitários de `diasEscolhaDoItem` e do resumo em `src/lib/dp/__tests__/folga-autoatribuicao.test.ts`, e teste de componente do diálogo de ausência em `src/test/unit`.
- Verificação: typecheck, lint, vitest, teste de banco em transação com rollback e conferência no navegador (janela "Gerar Folgas" com a data preenchida; cancelar uma folga e confirmar que o nome sai do calendário).
