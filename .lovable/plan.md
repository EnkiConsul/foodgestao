## Problema

Na lista vertical do calendário mobile (`src/components/dp/CalendarioMobileLista.tsx`), o rótulo do dia da semana + número do dia estão dentro de um único flex com `min-w-[64px]`. Como o número muda de 1 dígito (1–9) para 2 dígitos (10–31), o bloco inteiro fica mais largo em dias de 2 dígitos, empurrando os chips (1/1, nomes) para a direita e criando o efeito "cobra" ao rolar.

## Correção

Ajustar somente o bloco de cabeçalho de cada linha em `CalendarioMobileLista.tsx` (linhas 141-159) para usar **duas colunas de largura fixa**:

1. Weekday (`SÁB`, `DOM`, …): largura fixa (`w-10`, `text-left`).
2. Número do dia: largura fixa (`w-6`, `text-right`, `tabular-nums`).
3. Remover `min-w-[64px]` do wrapper e usar `w-16 shrink-0` para travar a coluna inteira.

Resultado: o início da coluna de chips fica **exatamente** no mesmo x em todos os dias, independentemente de o número ter 1 ou 2 dígitos.

## Fora de escopo

- Não altero tipografia, cores, espaçamento vertical, ícones ou lógica de renderização de chips/bloqueios.
- Não mexo na versão desktop (grid) nem em outras telas.