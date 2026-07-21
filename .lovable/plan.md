## Causa raiz

O bloco de "Negociação coletiva pendente" em `src/hooks/useDpPendencias.tsx` lê o vínculo unidade↔sindicato da tabela `dp_unidade_cargos`, mas essa tabela só tem `(unidade_id, cargo_id)` — não existe coluna `sindicato_laboral_id`. A consulta lança erro, cai no `catch` silencioso, e nenhuma pendência de negociação é gerada. Por isso a última negociação de 2025 (vencida em 05/2026) não aparece.

Os vínculos reais estão em `dp_sindicato_unidades (sindicato_id, unidade_id)`, e o tipo (`laboral`/`patronal`) fica em `dp_sindicatos.tipo`.

## Correção

Editar apenas o bloco 6 de `src/hooks/useDpPendencias.tsx`:

1. Trocar a fonte de vínculos: consultar `dp_sindicato_unidades` join com `dp_sindicatos` filtrando `tipo = 'laboral'`, `ativo = true` e `company_id` do contexto.
2. Para cada par (unidade, sindicato laboral), buscar a última negociação em `dp_sindicato_negociacoes` filtrando por `company_id`, `unidade_id` e casando `sindicato_laboral_id = S OR sindicato_id = S` (compatibilidade com registros antigos que usam apenas `sindicato_id`), ordenada por `ano DESC, mes DESC`.
3. Vencimento = último dia de (`ano + 1`, `mes`). Gerar pendência quando:
   - não existir nenhuma negociação para o par, ou
   - a última estiver vencida, ou
   - faltarem ≤ 60 dias para vencer.
4. Filtrar unidades ativas (usar o `unidades` já carregado no início do hook para descartar unidades inativas/fora do escopo).

Nenhuma alteração em UI, rotas, ou outras pendências.

## Validação

Com os dados atuais:
- SECHSEG (`3e2d3704…`) × unidade `ba21d87d…` → última 07/2026 → vencimento 31/07/2027 → sem alerta.
- SECHSEG (`02864e4f…`) × unidades `9d412df7…` e `afd5ac01…` → última 05/2025 → vencimento 31/05/2026 → atrasada ~51 dias → devem aparecer 2 pendências em `/inicio`.
