## Causa raiz (confirmada nos dados)

O bloco 6 de `src/hooks/useDpPendencias.tsx` descobre os pares "unidade × sindicato laboral" através de `dp_sindicato_unidades`. Nos dados atuais essa tabela contém apenas sindicatos **patronais** (SINDIBARES, SINDTUR). Os sindicatos **laborais** (SECHSEG) não estão nela — no modelo do Pakerê, o vínculo laboral é derivado dos **cargos** da unidade, e não guardado numa tabela unidade↔sindicato.

Por isso o filtro `tipo='laboral'` em `dp_sindicato_unidades` retorna zero linhas e nenhuma pendência de negociação aparece, embora existam três negociações em `dp_sindicato_negociacoes` (uma de 07/2026 e duas de 05/2025 já vencidas).

## Correção

Editar somente o bloco 6 do hook `src/hooks/useDpPendencias.tsx`. Nenhuma alteração de schema, UI, rotas ou outros blocos.

Nova estratégia de descoberta dos pares (unidade × sindicato laboral) da empresa vigente, tomando a união de duas fontes para cobrir dados legados e futuros:

1. **Via cargos** (equivalente ao Pakerê original):
   `dp_unidade_cargos` × `dp_sindicato_cargos` × `dp_sindicatos` filtrando `tipo='laboral'`, `ativo=true` e `company_id = selectedCompanyId`. Cada linha resultante produz um par (unidade_id, sindicato_id) laboral.
2. **Via negociações existentes** (fallback para pares já registrados sem cargos vinculados):
   `dp_sindicato_negociacoes` do `company_id`, agrupada por (`unidade_id`, `COALESCE(sindicato_laboral_id, sindicato_id)`), restringindo o segundo termo a sindicatos com `tipo='laboral'`.

Restringir ambos à lista de unidades ativas (`unidades` já carregada no início do hook) para descartar unidades inativas.

Para cada par distinto, buscar a última negociação em `dp_sindicato_negociacoes` (`ano DESC, mes DESC`) casando `sindicato_laboral_id = S OR sindicato_id = S` — regra atual mantida.

Regra de vencimento (mantida como está hoje no código):
- vencimento = último dia de (`ano_última + 1`, `mes_última`);
- gera pendência se: não há negociação, ou está atrasada, ou faltam ≤ 60 dias para vencer;
- pares sem qualquer negociação também geram pendência ("nenhuma negociação cadastrada").

## Validação esperada

Com os dados atuais da empresa `b0d450a7…`:
- unidades `9d412df7…` e `afd5ac01…` × SECHSEG (`02864e4f…`) → última 05/2025 → vencimento 31/05/2026 → 2 pendências atrasadas em `/inicio`.

Empresa `9293cf25…`:
- unidade `ba21d87d…` × SECHSEG (`3e2d3704…`) → última 07/2026 → vencimento 31/07/2027 → sem pendência.

## Detalhes técnicos

- Sem migração e sem novos endpoints; apenas consultas ao Supabase JS.
- Deduplicar pares num `Map<unidadeId, Set<sindicatoId>>` antes do laço de última negociação.
- Consultas por `.in('unidade_id', unidadesAtivasIds)` para minimizar payload.
- Manter `try/catch` do bloco e o `console.warn` existente para diagnóstico.
