## Minha opinião

Concordo com você — a dica sai. Toast de onboarding no primeiro carregamento é ruído: aparece no momento em que o usuário está tentando ler a tela, compete com toasts reais do sistema e ensina algo que o usuário descobre sozinho (o swipe da borda esquerda já é reflexo em iOS/Android). Apps de referência (iFood, Nubank, Gmail) não avisam sobre gestos de borda.

Se um dia fizer sentido documentar, o lugar certo é a página "Mais" (uma linha discreta em Ajuda/Configurações), não um toast intrusivo.

## O que muda

**`src/hooks/useEdgeGestures.ts`**
- Remover o `useEffect` que dispara o toast de dica, junto com a constante `HINT_KEY`, o acesso ao `localStorage` e os imports de `toast` e do hook de mobile usados só por ele.
- Os gestos continuam exatamente iguais: borda esquerda = Voltar, borda direita = abrir "Mais", com háptico e as travas de dialog/scroll horizontal.

Nada mais é alterado.
