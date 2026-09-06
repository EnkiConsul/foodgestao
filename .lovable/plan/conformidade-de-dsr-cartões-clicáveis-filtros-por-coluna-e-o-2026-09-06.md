# Conformidade de DSR — cartões clicáveis, filtros por coluna e ordenação

## O que muda na tela (Pessoas > Folgas > Conformidade)

### 0. Filtros no título de cada coluna (como em Cadastro de Colaboradores)
- Sai a barra de filtros do topo (unidade, cargo, situação, busca por nome).
- Cada título de coluna passa a ter o mesmo menu da tabela de colaboradores: ordenar (crescente/decrescente) e filtrar marcando valores numa lista com busca — nome, unidade, cargo, folgas no mês e situação.
- Mantém os mesmos recursos daquela tabela: arrastar para reordenar colunas e ajustar largura, gravados por tela.
- No topo ficam apenas: competência (mês), o selo clicável de "fora de conformidade" e o botão Exportar CSV.

### 1. Lista simplificada
Cada colaborador passa a aparecer numa linha/cartão enxuto, mostrando apenas:
- Unidade
- Nome do colaborador
- Cargo
- Folgas no mês (quantidade de folgas marcadas, com destaque das folgadas em dia de descanso)
- Situação (selo "Conforme" / "Fora de conformidade")

Saem da lista: "Domingos no período", "Regra aplicada" e "Dias negociados aproveitados".

A lista mantém o formato atual (tabela no computador, cartões no celular), mas cada linha/cartão inteiro fica clicável, com cursor de clique e estado de foco para teclado.

### 2. Cartão de detalhes (clique abre)
Ao clicar, abre um diálogo com os detalhes daquele colaborador no mês:
- Regra aplicada (ex.: "1 folga de fim de semana por mês") e de onde ela vem (regra da loja, exceção feminina ou regra padrão da empresa)
- Domingos no período e quantos ele folgou
- Folgas marcadas no mês, com a lista das datas e o dia da semana de cada uma
- Mínimo esperado e situação final
- Explicação em linguagem clara do que são os "dias negociados": os dias de descanso combinados com o sindicato (ex.: sábado e domingo) que, por acordo coletivo, substituem o domingo na contagem da folga obrigatória — com a quantidade aproveitada

### 3. Rótulo mais claro
O termo "Dias negociados aproveitados" passa a aparecer só dentro do detalhe, com a explicação acima; no CSV o nome da coluna fica "Folgas em dias de descanso negociados".

### 4. Inalterado
- Cálculo de conformidade (já corrigido para o modelo "por mês")
- Exportação CSV, que ganha apenas o novo nome de coluna e respeita os filtros aplicados nas colunas

## Detalhes técnicos
- `src/pages/dp/DpConformidadeDsr.tsx`: remover a barra de filtros do topo e adotar o padrão da tabela de colaboradores — `DpTableColumnHeader` + hook `useDpTableColumns` (ordenar, filtrar por valores, reordenar e redimensionar colunas, com `storageKey` próprio, ex.: `dp_conformidade_col`); colunas com `value` para filtro/ordenação e `render` para exibição.
- Remover colunas "Domingos no período", "Regra aplicada" e "Dias negociados aproveitados" da tabela e dos cartões mobile; tornar linha/cartão clicável (`role="button"`, `onKeyDown` Enter/Espaço) abrindo um `Dialog` com os dados da linha selecionada.
- Texto explicativo dos dias negociados montado a partir de `tipoDiasDescanso` / `diasElegiveisDaConfig` já existentes.
- Sem mudanças em `dsr-rules.ts` (dados já disponíveis: `rotuloFrequencia`, `domingosNoPeriodo`, `folgasMarcadas`, `negociadosAproveitados`, datas das folgas).
- Verificação: typecheck (`tsgo`), lint, vitest e conferência visual no navegador (filtrar/ordenar por coluna; abrir o detalhe de um colaborador conforme e de um fora de conformidade).
