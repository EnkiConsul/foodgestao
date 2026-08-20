# Corrigir o selo de risco na lista/ficha de Cargos

## Problema

Na listagem de cargos e na ficha, o rótulo é fixo em "insalubre" e aparece sempre que o switch "Cargo insalubre ou perigoso" está ligado — independentemente de o percentual informado ser de insalubridade ou de periculosidade. Foi o caso de MOTOQUEIRO, cadastrado com 30% de periculosidade.

## Ajuste (apenas apresentação)

Na lista (`src/pages/dp/DpCargos.tsx`):

- Mostrar o selo com base nos percentuais gravados no cargo:
  - `insalubridade_percentual > 0` → selo "insalubridade 20%" (com o percentual real).
  - `periculosidade_percentual > 0` → selo "periculosidade 30%".
  - ambos > 0 → mostrar os dois selos (a validação de não cumulatividade já existe no formulário).
  - switch ligado sem percentual informado → selo neutro "risco a definir".
- Cores distintas por tipo (âmbar para insalubridade, vermelho/destructive suave para periculosidade), usando tokens do design system.

Na ficha de visualização do cargo:

- Trocar o campo "Insalubridade / periculosidade: Sim/Não" por duas linhas explícitas: "Insalubridade: 20% / não aplicável" e "Periculosidade: 30% / não aplicável".

## Técnico

- Novo helper de apresentação (ex. `selosRiscoCargo`) em `src/lib/dp/cargos.ts` retornando `{ tipo, label, percentual }[]` a partir do cargo, com teste unitário em `src/lib/dp/__tests__/cargos.test.ts`.
- Sem mudança de banco e sem mudança nas regras de cálculo dos adicionais.
