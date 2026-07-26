## Plano

1. Corrigir a lista mobile de `Folgas`
   - O calendário da tela de folgas ainda usa um layout próprio com `min-w` e `items-baseline`, então os números continuam variando de posição ao rolar.
   - Trocar esse bloco por colunas fixas: coluna do dia da semana, coluna do número e depois a área dos chips.

2. Padronizar o alinhamento em todos os calendários mobile do DP
   - Manter o padrão já iniciado em `CalendarioMobileLista`.
   - Garantir que o número do dia use largura fixa, `text-right`, `tabular-nums` e `leading-none`.
   - Garantir que a área de chips comece sempre no mesmo eixo horizontal.

3. Ajustar ergonomia visual
   - Preservar destaque do dia atual, bloqueios e chips existentes.
   - Evitar que dias com 1 ou 2 dígitos mudem a posição dos nomes/status.

## Detalhe técnico

A correção principal é substituir estruturas flexíveis como:

```text
[DOM] [9] [chips]
[SEG] [10] [chips]
```

por uma grade fixa:

```text
[coluna fixa weekday] [coluna fixa número alinhado à direita] [chips]
```

Assim o `9`, `10`, `19`, `30` ficam alinhados pela direita, e os chips começam sempre no mesmo ponto.