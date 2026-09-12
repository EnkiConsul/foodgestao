# Gestos de arrasto nas abas e voltar no menu Mais

## O que muda para você

1. **Arrastar para os lados troca de aba**: em qualquer tela com abas (Férias, Colaboradores, Documentos, Comunicação etc.), arrastar o dedo para a esquerda avança para a próxima aba e para a direita volta para a aba anterior — sem precisar tocar no nome da aba.
2. **Na tela Mais, arrastar da esquerda para a direita volta**: em vez de abrir o Hub/Analytics, o gesto retorna para a tela de onde você veio antes de abrir o Mais.

## Como vai funcionar

- O gesto de abas passa a existir no próprio componente de abas, então **todas as telas que já usam abas ganham o gesto automaticamente**, sem mexer tela por tela.
- O gesto **não interfere** em:
  - tabelas e listas com rolagem horizontal (o dedo continua rolando o conteúdo);
  - telas com diálogo/janela aberta;
  - os gestos de borda já existentes (borda esquerda = voltar, borda direita = menu Mais): os primeiros 28px de cada lateral continuam reservados a esses gestos.
- Regras do gesto de abas: deslocamento horizontal mínimo de 70px, gesto rápido (até 500ms) e predominantemente horizontal; leve vibração tátil ao trocar.
- Abas desabilitadas são puladas; ao chegar na última aba, o gesto para a esquerda não faz nada (sem laço infinito).

## Detalhes técnicos

- `src/components/ui/tabs.tsx`: o `Tabs` raiz passa a envolver o conteúdo com detector de `touchstart`/`touchend`; ao detectar swipe, localiza os `TabsTrigger` no DOM, identifica a aba ativa e aciona a anterior/próxima via clique (preserva toda a lógica de estado controlado/não controlado do Radix).
- Reuso das mesmas regras de `useEdgeGestures.ts` (scroller horizontal, diálogo aberto, faixa de borda de 28px).
- `src/lib/nav/edgeGestureTargets.ts` + `useEdgeGestures.ts`: quando `pathname` for a rota do "Mais" do módulo, o gesto esquerda→direita passa a retornar "voltar" (navigate(-1)), em vez de Hub/Analytics.
- Somente mobile (`isMobile`); desktop inalterado.
- Testes: unitários para a lógica de ordenação/pulo de abas desabilitadas e para o novo destino do gesto na tela Mais; validação Playwright em viewport mobile simulando swipes em uma tela de abas (Férias) e no menu Mais.
