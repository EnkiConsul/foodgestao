## Objetivo

Ajustar o cálculo de `atrasoDias` para pendências de Negociação Coletiva (ACT/CCT) em `src/hooks/useDpPendencias.tsx`, para que a régua use a **data-base da última negociação registrada** (mês/ano) em vez de 31/12 do ano vigente.

## Regra nova

Para cada par unidade × sindicato laboral, considerando a última negociação (`ano`, `mes`):

- **Data-base**: primeiro dia do mês/ano da última negociação.
- **Vencimento**: último dia do mesmo mês, **um ano depois** da data-base (`new Date(ano+1, mes-1, 0)`).
- **Início do atraso**: dia seguinte ao vencimento.
- **atrasoDias** = `differenceInCalendarDays(hoje, inicioAtraso)`.
  - `> 0` → "Atrasado Xd" (vermelho)
  - `= 0` → "Vence hoje" (âmbar)
  - `< 0` → "Vence em Xd" (verde)

Exemplo: última = 05/2025 → vence 31/05/2026 → início atraso 01/06/2026 → hoje 21/07/2026 → **Atrasado 50d** (em vez de "Vence em 163d").

## Alterações

Arquivo único: `src/hooks/useDpPendencias.tsx`, bloco de negociações coletivas (~linhas 315-349):

1. Substituir `const vencimento = new Date(anoVigente, 11, 31)` por cálculo baseado em `mesUltimo`/`anoUltimo`:
   ```ts
   const vencimento = new Date(anoUltimo + 1, mesUltimo - 1, 0); // último dia do mês, +1 ano
   const inicioAtraso = addDays(vencimento, 1);
   const dias = differenceInCalendarDays(today, inicioAtraso);
   ```
2. Manter a condição de pendência: gerar somente quando `desatualizada` (última < ano/mês vigente), como já é hoje.
3. Ajustar o `subtitulo` para incluir o vencimento calculado, ex.: `"Camaçari — última 05/2025 · venceu em 05/2026"`.
4. Para o caso "nenhuma negociação cadastrada" (linhas 316-327), manter `atrasoDias = 0` (vence hoje) — sem data-base não há como calcular atraso.

Nenhuma mudança em componentes, RLS, banco ou outras pendências.

## Verificação

- Recarregar `/dp` e conferir que as pendências de SECHSEG/Pakerê Garavelo e Pakerê T-63 passam a exibir "Atrasado Xd" em vermelho.
- Ordenação (`b.atrasoDias - a.atrasoDias`) continua correta: mais atrasado primeiro.