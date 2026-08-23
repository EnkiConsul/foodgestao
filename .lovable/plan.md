# Painel da Operação (substitui a geração de escala)

A tela `/dp/escalas/mes` deixa de "gerar escala" e passa a ser um painel de leitura da operação, montado automaticamente do que já existe: jornada habitual dos fixos, folgas marcadas, convocações, férias e atestados. Duas abas: **Dia** e **Mês**. A tela Operação do Dia é absorvida por este painel.

## Aba Dia

Cabeçalho com data (setas para navegar), unidade e um bloco de indicadores:

- Fixos escalados
- Intermitentes convocados — total, com detalhe "aceitos" e "aguardando resposta"; convocação recusada ou expirada não entra na contagem
- Folga padrão (folga semanal da jornada)
- Folga extra
- Férias
- Atestado / licença

Abaixo, a quebra por turno (quem trabalha, horário) e a lista de ausentes com o motivo, no mesmo padrão visual da Operação do Dia. Comparação com a cobertura mínima cadastrada continua sinalizando descoberto.

## Aba Mês

Uma linha por dia da competência, com as mesmas seis colunas de contagem + total de pessoas trabalhando (fixos + convocados). Cada dia mostra:

- selo do dia da semana e destaque para fim de semana/feriado;
- comparação com o padrão histórico daquele dia da semana naquela unidade;
- clique no dia abre a aba Dia já posicionada nele.

Rodapé com médias do mês e os dias fora do padrão listados em destaque.

## Sinalização de padrão

O padrão vem dos dados reais: para cada unidade e cada dia da semana, o sistema calcula a mediana de pessoas trabalhando nas últimas 8 semanas. Sem histórico suficiente, o dia simplesmente aparece neutro, sem nenhum rótulo extra.

Sinalização por dia:

- **Abaixo do padrão** (âmbar) quando o previsto fica abaixo da mediana além da tolerância;
- **Acima do padrão** (azul) quando ultrapassa;
- tolerância padrão de 20%, ajustável na própria tela e memorizada na preferência do usuário.

Cada alerta explica o número: "previsto 7, padrão 10 para sextas na T-63".

## Dispensar alertas

Em cada dia alertado o gestor pode marcar "Está ok" (com observação opcional). O dia passa a exibir apenas um selo discreto de "revisado por <nome>" e sai da lista de destaques. Um filtro "mostrar dispensados" reexibe tudo, e o gestor pode reverter a dispensa. Se a contagem daquele dia mudar depois, o alerta volta a aparecer.

## Detalhes técnicos

- Novo hook `useDpOperacaoPanorama(competencia, unidadeId)`: uma única carga por competência com colaboradores ativos, `dp_colaborador_config_trabalho` + `dp_colaborador_config_dias` (vigência), `dp_turnos`, `dp_folgas` (tipos `normal`, `extra`, `licenca`), `dp_ferias_gozos`, `dp_convocacoes` (status aceita e pendente/enviada; exclui recusada/expirada/cancelada) e `dp_solicitacoes` de atestado aprovadas. Itens de `dp_escala_itens` publicados, quando existirem, continuam tendo prioridade sobre a jornada habitual (mesma regra de `useDpHorarioPrevisto`).
- Novo módulo puro `src/lib/dp/operacao-panorama.ts` com `contarDia()` (classifica cada colaborador em trabalho fixo / convocado aceito / convocado pendente / folga padrão / folga extra / férias / atestado, sem dupla contagem, na ordem férias > atestado > folga extra > folga padrão > trabalho) e `baselinePorDow()` (mediana das últimas 8 semanas + desvio), com testes unitários.
- Nova tabela `dp_operacao_alertas_dispensas` (company_id, unidade_id nullable, data, previsto_snapshot, padrao_snapshot, observacao, dispensado_por, dispensado_em) com RLS por empresa e GRANTs para `authenticated`/`service_role`; a dispensa só vale enquanto `previsto_snapshot` continuar igual ao previsto atual.
- `src/pages/dp/DpEscalaMes.tsx` reescrita como `DpOperacaoPanorama` com `DpTabsBar` (Dia | Mês), `DpStatCard` nos indicadores e tabela responsiva no mês (cards empilhados no mobile).
- A aba Dia reaproveita `montarOperacaoDia`, `alertasDoDia` e `resolverCoberturaMinima` já existentes.
- Menu: item renomeado para "Painel da Operação"; "Gerar Escala" (`/dp/escalas`) e "Operação do Dia" (`/dp/operacao`) saem do menu e dos favoritos em `src/config/dpNavigation.tsx` / `favoritablePages.ts`. `/dp/operacao` passa a redirecionar para o painel na aba Dia, preservando links e notificações existentes; o arquivo `DpOperacaoDia.tsx` é removido depois que a aba Dia cobre suas funções.

## Fora de escopo

- Editar a escala por esta tela (ajustes continuam por folgas, trocas e convocações).
- Alterar o portal do colaborador, cobertura mínima ou convocações.
