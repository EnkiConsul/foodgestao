# Conformidade de DSR — cartões clicáveis com detalhes

## O que muda na tela (Pessoas > Folgas > Conformidade)

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
- Filtros (competência, unidade, cargo, situação, busca) e o selo clicável de "fora de conformidade"
- Cálculo de conformidade (já corrigido para o modelo "por mês")
- Exportação CSV, que ganha apenas o novo nome de coluna

## Detalhes técnicos
- `src/pages/dp/DpConformidadeDsr.tsx`: remover colunas da tabela e dos cartões mobile; tornar linha/cartão clicável (`role="button"`, `onKeyDown` Enter/Espaço) abrindo um `Dialog` com os dados da linha selecionada.
- Texto explicativo dos dias negociados montado a partir de `tipoDiasDescanso` / `diasElegiveisDaConfig` já existentes.
- Sem mudanças em `dsr-rules.ts` (dados já disponíveis: `rotuloFrequencia`, `domingosNoPeriodo`, `folgasMarcadas`, `negociadosAproveitados`, datas das folgas).
- Verificação: typecheck (`tsgo`), lint, vitest e conferência visual no navegador (abrir o detalhe de um colaborador conforme e de um fora de conformidade).
