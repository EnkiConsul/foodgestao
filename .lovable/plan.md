# Histórico de Documentos: natureza, filtro por coluna e colunas arrastáveis

## 1. Barra de natureza só com os grupos

A barra superior "Natureza do Documento" passa a mostrar apenas os grupos, em uma única linha de chips:

`Todos · Remuneração · Jornada · Férias · Admissão · Desligamento · Fiscais / Anuais · Outros`

- Clicar em um grupo filtra a lista por aquela natureza; clicar novamente volta para "Todos".
- Os chips de tipo de documento (Contracheque Mensal, Espelho de Ponto, TRCT etc.) saem dessa barra.
- O filtro por tipo continua no card "Filtros" abaixo, no campo **Tipo** — que passa a listar os tipos agrupados por natureza e, quando um grupo está selecionado na barra, mostra apenas os tipos daquele grupo.

## 2. Filtro pelo título da coluna (menu suspenso)

A linha de inputs "Filtrar…" abaixo do cabeçalho é removida. Cada título de coluna filtrável (Colaborador, Tipo, Competência, Unidade, Status, Aceite) ganha um ícone de filtro ao lado do nome; clicar no título abre um menu com:

- campo de busca rápida dentro das opções;
- lista de valores presentes na tabela com caixas de seleção (multi-seleção);
- ações "Selecionar todos" e "Limpar";
- ordenação crescente/decrescente da coluna no topo do mesmo menu.

O ícone da coluna fica destacado quando há filtro ativo, e o botão "Limpar" do card de filtros zera também esses filtros de coluna.

## 3. Reordenar colunas arrastando

O usuário pode arrastar o título de uma coluna e soltar sobre outra para trocar a posição. A ordem escolhida é lembrada por usuário (armazenamento local do navegador), com um botão "Restaurar Colunas" para voltar ao padrão. A coluna de Ações permanece fixa à direita.

## Detalhes técnicos

Arquivo principal: `src/pages/dp/DpHistoricoCompleto.tsx`.

1. **Natureza**: manter o estado `grupo`; renderizar somente `DP_DOC_GRUPOS.map(g => chip)`. O `Select` de Tipo usa `SelectGroup`/`SelectLabel` por grupo e filtra as opções por `grupo` quando ele não é "all".
2. **Filtro por coluna**: trocar `colFilters` (string) por `Record<ColKey, Set<string>>`. Valores das opções derivados de `query.data` (distintos por coluna, ordenados). Implementar com `DropdownMenu` + `Checkbox` (ou `Command` para a busca) já disponíveis em `src/components/ui`. Filtro aplicado no `useMemo` de `filtered`: coluna sem seleção = sem restrição.
3. **Ordenação**: reaproveitar `toggleSort`; os itens "Ordenar A→Z / Z→A" no menu chamam a mesma função. O clique direto no título deixa de ordenar (passa a abrir o menu).
4. **Reordenação de colunas**: definir um array de descritores de coluna (`key`, `label`, `width`, `sortKey`, `render`, `filterable`) e um estado `colOrder: ColKey[]` persistido em `localStorage` (`dp_historico_col_order`), com validação contra o conjunto atual de chaves. Cabeçalho e células passam a ser renderizados iterando `colOrder`. Drag & drop nativo HTML5 (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) no `TableHead`, sem dependência nova.
5. **Mobile**: os cards continuam como estão; a reordenação e os menus de coluna são recursos do modo tabela (`md:` para cima). A barra de naturezas fica com rolagem horizontal em telas pequenas.
6. Sem alterações de banco, RLS ou edge functions.
