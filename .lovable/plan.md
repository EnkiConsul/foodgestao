# Ajuste nos cards de subtelas: descrição com 2 linhas no mobile

## Objetivo
Garantir que a descrição dos cards de subtelas exiba até duas linhas no mobile, sem cortar o texto com reticências.

## Problema
Na versão anterior, a descrição dos cards de subtelas foi limitada a uma linha no mobile (`line-clamp-1`), o que ainda corta parte do texto em cards com descrições mais longas.

## Solução
- Em `src/components/dp/NavigationCard.tsx`, alterar a descrição para usar `line-clamp-2` em todas as telas (mobile e desktop).
- Manter o layout compacto com ícone + título na mesma linha.
- Ajustar, se necessário, o espaçamento interno ou a altura mínima para acomodar as duas linhas sem quebrar o alinhamento.

## Arquivo envolvido
- `src/components/dp/NavigationCard.tsx`

## Critérios de aceitação
- A descrição dos cards de subtelas mostra até 2 linhas completas no mobile.
- O texto não é cortado prematuramente com "..." quando cabe em até 2 linhas.
- O card continua compacto e o ícone/título permanecem na mesma linha.
