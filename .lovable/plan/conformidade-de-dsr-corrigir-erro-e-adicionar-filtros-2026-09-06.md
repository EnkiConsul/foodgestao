# Conformidade de DSR: corrigir erro e adicionar filtros

## O erro

A tela monta o fim do período sempre como "dia 31" da competência. Em setembro (30 dias) essa data não existe, o banco recusa a consulta e a tela mostra "Não foi possível carregar os dados". Confirmado: a mesma consulta com `2026-09-31` retorna erro de data fora de faixa. O mesmo aconteceria em fevereiro, abril, junho e novembro.

Correção: calcular o último dia real do mês escolhido e usar essa data no filtro. Assim a competência atual (setembro) volta a carregar.

## Filtros úteis para o gestor

Acrescentar na barra de filtros, ao lado da competência:

- Unidade (todas ou uma loja específica) — hoje a tela mistura todas as unidades, mesmo com regras diferentes por loja.
- Cargo.
- Situação: todos / apenas fora de conformidade / apenas conformes.
- Busca por nome do colaborador.
- Atalho: clicar no selo "X fora de conformidade" aplica o filtro de situação.
- Botão "Limpar filtros" quando algum filtro estiver ativo.

Comportamento:

- O selo de contagem e o "Exportar CSV" passam a refletir o que está filtrado, com o total geral indicado ao lado.
- Mensagem de lista vazia diferencia "nenhum colaborador no período" de "nenhum resultado para os filtros".
- Coluna de Unidade e Cargo na tabela (e nos cartões do celular), para o gestor saber de qual loja é cada linha quando o filtro está em "todas".

## Detalhes técnicos

- `src/pages/dp/DpConformidadeDsr.tsx`: substituir `const fim = \`${competencia}-31\`` por um helper `ultimoDiaDoMes(competencia)`; incluir `cargo_id` na seleção de colaboradores e carregar nomes de cargos/unidades já disponíveis nos hooks do DP; aplicar os filtros em um `useMemo` sobre `linhas` antes de renderizar e antes do CSV.
- Teste unitário para o helper de último dia do mês (meses de 30/31 dias e fevereiro em ano bissexto).
- Sem mudanças de banco.
