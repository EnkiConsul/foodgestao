# Férias: concluir o que faltou do plano

A parte do relatório sintético (cabeçalho por unidade, nome repetido, colunas configuráveis, CSV e impressão) já está pronta. Faltam três pontos.

## 1. Uma única aba Férias com Analítica e Sintética

As abas **Planejamento** e **Programação** viram uma só aba **Férias**, com um seletor no topo:

- **Analítica** — a tela atual de planejamento (cartões por período).
- **Sintética** — o relatório no formato da contabilidade, com Imprimir/PDF e CSV.

A escolha fica no endereço da página (`?aba=ferias&visao=analitica|sintetica`), então links salvos continuam funcionando.

## 2. Nova aba Status

**Solicitações**, **Programadas**, **Em férias** e **Histórico** passam a ser sub-visões de uma aba **Status**, com um seletor interno (Solicitadas / Programadas / Em férias / Histórico). Cada uma mantém exatamente o conteúdo e as ações de hoje.

Barra de abas final: **Férias**, **Status**, **Calendário**, **Contabilidade**, **Regras**.

## 3. Visão analítica: só o que há para gozar

- Períodos totalmente gozados deixam de aparecer por padrão.
- Nova opção **Incluir períodos já gozados** traz esses períodos de volta, com a contagem de quantos estão ocultos, no mesmo estilo do "Incluir desligados".

## Detalhes técnicos

- `src/pages/dp/DpFeriasHub.tsx`: `ABAS` passa a `["ferias","status","calendario","contabilidade","regras"]`. A aba `ferias` renderiza um ToggleGroup Analítica/Sintética controlando `?visao=`, com `DpEmbeddedProvider` + `Suspense` para o painel analítico lazy e `FeriasProgramacaoPanel` na sintética. A aba `status` renderiza um seletor (`?status=solicitadas|programadas|em-ferias|historico`) sobre `FeriasSolicitacoesPanel` e `FeriasGozosPanel` com os mesmos filtros de status atuais.
- Compatibilidade de links antigos no próprio hub: `planejamento`→`ferias&visao=analitica`, `programacao`→`ferias&visao=sintetica`, `solicitacoes|programadas|em-ferias|historico`→`status` com a sub-visão correspondente.
- `src/pages/dp/DpFerias.tsx`: estado `incluirGozados` (padrão falso) filtrando `periodosFiltrados` por saldo a gozar, com contador de ocultos ao lado do checkbox.
- Sem mudanças de banco.
