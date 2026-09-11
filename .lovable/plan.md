# Pendências: filtros por urgência e licença sem folha de ponto

## 1. Botões Atrasado / Urgente / Hoje / Próximo passam a filtrar

- Cada selo vira um botão. Ao tocar, a lista abaixo mostra só as pendências daquela urgência; tocar de novo (ou em "Todas") volta ao normal.
- O selo ativo fica destacado; o total no topo passa a refletir o filtro escolhido.
- O filtro também vale quando um grupo (ex.: Contracheque) é aberto: mostra apenas os itens daquela urgência.
- Selos com contagem zero não são clicáveis.

## 2. No celular, só aparecem selos com valor maior que zero

- No celular, selos zerados ficam ocultos. Se tudo estiver zerado, nenhum selo aparece.
- No computador continua como hoje, mostrando os quatro.

## 3. Mês inteiro de licença não cobra folha de ponto

- Quando a pessoa está 100% afastada por licença (maternidade/paternidade) aprovada em todos os dias trabalháveis do mês, a folha de ponto daquele mês deixa de ser exigida dela — caso da Rosângela em fevereiro.
- Se o afastamento cobre só parte do mês, a folha continua sendo pedida.
- Vale só para a folha de ponto; contracheque e adiantamento seguem as regras atuais (o pagamento continua acontecendo durante a licença).
- A mesma regra é aplicada nas telas Início, Pendências e Importar, já que as três leem a mesma fonte.

## Detalhes técnicos

- `src/components/dp/home/PendenciasCard.tsx`: estado local `urgenciaFiltro`, `UrgencyChip` recebe `onClick`/`active`, filtro aplicado antes de `agruparPorTipo` e dentro do grupo aberto; ocultação de zerados via classe responsiva (`hidden` + `sm:inline-flex`) para não mudar o desktop.
- `src/lib/dp/pendencias-documentos.ts`: nova opção `afastadoMesInteiro` em `ElegibilidadeOpts`, tratada apenas no ramo do tipo `ponto` (retorna false).
- `src/hooks/useDpPendencias.tsx`: uma consulta a `dp_solicitacoes` (tipos de licença aprovados, intervalo `rangeInicio`/`rangeFim`) monta um `Set<colaborador:competência>` de cobertura integral usando `data_alvo`/`data_fim` versus o intervalo da competência; passado em `elegibilidadeDe`.
- Testes: casos novos em `src/lib/dp/__tests__/pendencias-documentos-elegibilidade.test.ts` (mês integral, mês parcial) e no teste do cartão para o filtro por urgência.
