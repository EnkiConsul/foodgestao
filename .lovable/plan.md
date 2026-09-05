# Ajuste visual: cards de unidade e lista de particularidades

Dois pontos aparecem na tela Pessoas > Folgas > Regras: o nome da unidade fica cortado nos cards ("Pakerê Ga...") e a lista de regras cadastradas dentro da ficha ficou desorganizada quando há mais de uma regra.

A Particularidade de Folgas continua onde está: dentro da ficha de cadastro das regras da unidade. Nada sai de lá.

## Cards de unidade

- Nome da unidade em destaque, sem corte: passa a ocupar a linha inteira e quebra em duas linhas quando for longo.
- Ícone da loja num quadradinho ao lado do nome, para dar peso visual.
- Botões "Editar" e a lixeira descem para uma linha própria no rodapé do card, alinhados à direita, em vez de disputar espaço com o nome.
- Resumo (base da regra, dias de descanso, frequência, período de escolha) mantém as mesmas informações, com rótulo e valor um embaixo do outro para não espremer o texto.

## Lista de particularidades (dentro da ficha)

Cada regra passa a ser um bloco com estrutura fixa, em vez de uma frase longa numa linha só:

```text
[Quantidade de pessoas por dia]        (•/ ) Editar  🗑
Todos os dias · ATENDENTE, PIZZAIOLO
Máximo 1 pessoa em folga
```

- Primeira linha: etiqueta do tipo de regra à esquerda e as ações (ligar/desligar, Editar, Excluir, Replicar) sempre no mesmo lugar à direita.
- Segunda linha: dia da semana e cargos/pessoas envolvidas, com os cargos como etiquetas separadas.
- Terceira linha: o limite em destaque ("Máximo 1 pessoa em folga").
- O nome da unidade sai do texto de cada regra — a ficha inteira já é daquela unidade, então repetir só polui.
- Vigência e "Desativada" continuam como etiquetas quando existirem.
- Os filtros no topo (Todas / Quantidade / Limite por cargo / Não folgam juntos) ficam agrupados num seletor único e mais compacto.

## Detalhes técnicos

- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: `UnitCard` reorganizado — remover `truncate` do `h3`, título em `text-lg`/`leading-snug` com `break-words`, ações movidas para o rodapé do card (`CardFooter`-like), lista `dl` em blocos empilhados em vez de `flex justify-between`.
- `src/components/dp/folgas/FolgaRegrasPanel.tsx`: item da lista (`<li>`) reescrito em três linhas (`grid`/`flex-col`), com `TIPO_REGRA_LABEL` como badge na primeira linha e as ações agrupadas num `div` alinhado à direita; cargos e pessoas renderizados como badges a partir de `nomeCargo`/`nomeColab` em vez de virem dentro da frase de `resumoRegraLimite`.
- Nova função em `src/lib/dp/folga-limites.ts` para as partes separadas do resumo (dia, escopo, limite), reaproveitando a lógica atual de `resumoRegraLimite`, que continua existindo para outros usos (calendário, portal).
- Barra de filtros com `ToggleGroup` (`type="single"`) no lugar dos botões soltos.
- Somente apresentação: nenhuma mudança de banco, hooks de gravação ou regras de cálculo.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/test/unit/folgaLimites.test.ts`, lint nos arquivos alterados e conferência no navegador na aba Regras.

## Fora do escopo

- Mover a Particularidade de Folgas para fora da ficha.
- Mudar campos, validações ou o comportamento de salvar.
