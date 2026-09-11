# Férias: uma aba com visão analítica e sintética

## Aba única com seletor de visão

As abas **Planejamento** e **Programação** viram uma só aba **Férias**, com um seletor no topo:

- **Analítica** — a tela atual de planejamento (cartões por período, com Programar, Saldo trazido, Informar faltas, selos de risco).
- **Sintética** — o relatório em formato da contabilidade, com Imprimir/PDF e CSV.

A escolha fica na URL (`?aba=ferias&visao=analitica|sintetica`) e é lembrada, então o usuário volta na visão que preferir. Os filtros comuns (unidade/colaborador, incluir desligados) continuam válidos nas duas visões.

## Visão analítica: só o que há para gozar

- Períodos **totalmente gozados** (sem saldo a gozar) deixam de aparecer por padrão.
- Nova opção **Incluir períodos já gozados** traz esses períodos de volta, com contagem de quantos estão ocultos, no mesmo estilo do "Incluir desligados".

## Visão sintética: nome repetido e colunas configuráveis

- O nome, código e admissão do colaborador passam a **repetir em cada período**, em vez de aparecer só na primeira linha (também no CSV e no impresso).
- A tabela ganha o mesmo comportamento de planilha da lista de colaboradores:
  - arrastar o título para reordenar colunas;
  - alça na borda direita para redimensionar (duplo clique volta ao padrão);
  - menu no título com Ordenar Crescente/Decrescente e filtro por valores;
  - botão **Colunas** para mostrar/ocultar e **Restaurar Padrão**.
- Ordem, larguras e colunas visíveis ficam salvos por usuário; filtros e ordenação são temporários.
- Colunas: Código, Empregado, Admissão, Vencimento, Venc., Prop., Início/Fim aquisitivo, Início gozo, Dias, Abono, 13º, Direito, Gozados, Restantes, Limite p/ gozo, Afastamento, Faltas, Situação, Dias p/ limite, Dias p/ marcar. Empregado é coluna essencial. Imprimir e CSV seguem as colunas visíveis, na ordem escolhida.

## Cabeçalho do relatório sintético reflete a unidade filtrada

Hoje o cabeçalho usa sempre o nome fantasia da empresa (que é de uma unidade) com o CNPJ da matriz — combinação errada quando há mais de uma unidade com CNPJ próprio. Correção:

- **Uma unidade filtrada**: cabeçalho mostra o nome e o CNPJ **daquela unidade** (`dp_unidades.nome` + `dp_unidades.cnpj`).
- **"Todas"**: mostra a **razão social da empresa** (`companies.name`, não o nome fantasia de unidade) com o CNPJ da matriz; se houver unidades com CNPJ próprio, indica no subtítulo "Consolidado de todas as unidades".
- O mesmo cabeçalho corrigido vale para tela, impresso/PDF e CSV.

## Detalhes técnicos

- `src/pages/dp/DpFeriasHub.tsx`: remove os `TabsTrigger` "Planejamento" e "Programação", cria a aba `ferias` que renderiza um novo `FeriasViewSwitch` (ToggleGroup Analítica/Sintética) controlando `?visao=`, com `DpEmbeddedProvider` + `Suspense` para o painel analítico lazy. Redireciona `aba=planejamento|programacao` para `aba=ferias` com a visão correspondente (compatibilidade com links existentes de pendências/dashboard).
- `src/pages/dp/DpFerias.tsx`: novo estado `incluirGozados` (default false) filtrando em `periodosFiltrados` por saldo a gozar (`dias_saldo <= 0` e status concluído), com contador de ocultos ao lado do checkbox.
- `src/lib/dp/ferias-programacao.ts`: `montarProgramacao` passa a preencher `codigo`, `nome`, `admissao`, `feriasVencidas`, `feriasProporcionais` em todas as linhas do colaborador (campos deixam de ser `null` em linhas subsequentes); `programacaoParaCsv` e `programacaoDocumento` recebem a lista de colunas visíveis (`ProgramacaoColKey[]`) e passam a montar cabeçalho/células a partir dela. Nova tabela de metadados de coluna (chave, rótulo, alinhamento, largura padrão, valor de texto por linha) reaproveitada por tela, CSV e impresso.
- `src/hooks/useDpFeriasProgramacao.tsx`: passa a buscar também `dp_unidades` (nome, cnpj) da empresa; `montarProgramacao` recebe `unidades` e resolve o cabeçalho pela regra acima (unidade filtrada → nome/CNPJ da unidade; todas → `companies.name` + CNPJ da empresa, com flag `consolidado` no `ProgramacaoDados` para o subtítulo).
- `src/components/dp/ferias/FeriasProgramacaoPanel.tsx`: adota `useDpTableColumns` (`storageKey: "dp_ferias_prog_col"`, `screenKey: "dp_ferias_programacao"`, `essentialKeys: ["nome"]`, `hiddenByDefault` nas colunas menos usadas), `DpTableColumnHeader` e `DpTableColumnsMenu`; ordenação/filtros aplicados sobre as linhas mantendo os períodos de um colaborador juntos; cabeçalho usa a identidade resolvida (unidade ou empresa) e mostra "Consolidado de todas as unidades" quando aplicável.
- Testes atualizados/adicionados em `src/lib/dp/__tests__/ferias-programacao.test.ts` (nome repetido, CSV por colunas visíveis) e teste do filtro de períodos gozados.
- Sem mudanças de banco.
