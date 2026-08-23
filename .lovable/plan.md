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

## Sinalização de padrão (aprendizado)

O padrão é aprendido dos dados reais: para cada unidade e cada dia da semana, o sistema calcula a mediana de pessoas trabalhando nas últimas 8 semanas. Enquanto houver menos de 3 semanas de histórico, o dia aparece como "aprendendo" e não gera alerta.

Sinalização por dia:

- **Abaixo do padrão** (âmbar/vermelho) quando o previsto fica abaixo da mediana além da tolerância;
- **Acima do padrão** (azul) quando ultrapassa;
- tolerância padrão de 20%, ajustável na própria tela pelo gestor e memorizada na preferência do usuário.

Cada alerta explica o número: "previsto 7, padrão 10 para sextas na T-63".

## Detalhes técnicos

- Novo hook `useDpOperacaoPanorama(competencia, unidadeId)`: uma única carga por competência com colaboradores ativos, `dp_colaborador_config_trabalho` + `dp_colaborador_config_dias` (vigência), `dp_turnos`, `dp_folgas` (tipos `normal`, `extra`, `licenca`), `dp_ferias_gozos`, `dp_convocacoes` aceitas e `dp_solicitacoes` de atestado aprovadas. Itens de `dp_escala_itens` publicados, quando existirem, continuam tendo prioridade sobre a jornada habitual (mesma regra de `useDpHorarioPrevisto`).
- Novo módulo puro `src/lib/dp/operacao-panorama.ts` com `contarDia()` (classifica cada colaborador em trabalho fixo / convocado / folga padrão / folga extra / férias / atestado, sem dupla contagem, na ordem férias > atestado > folga extra > folga padrão > trabalho) e `baselinePorDow()` (mediana das últimas 8 semanas + desvio), com testes unitários.
- `src/pages/dp/DpEscalaMes.tsx` reescrita como `DpOperacaoPanorama` com `DpTabsBar` (Dia | Mês), `DpStatCard` nos indicadores e tabela responsiva no mês (cards empilhados no mobile).
- A aba Dia reaproveita `montarOperacaoDia`, `alertasDoDia` e `resolverCoberturaMinima` já existentes.
- Menu: item renomeado para "Painel da Operação" em `src/config/dpNavigation.tsx`; o item "Gerar Escala" (`/dp/escalas`) sai do menu (rota e código preservados).
- Sem migração de banco e sem alteração nas tabelas de escala; nada é apagado.

## Fora de escopo

- Editar a escala por esta tela (ajustes continuam por folgas, trocas e convocações).
- Alterar o portal do colaborador, cobertura mínima ou convocações.
