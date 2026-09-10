# Zerar pendências de adiantamento da Pakerê antes de 07/2026 (somente dados)

## Objetivo

Na Pakerê o adiantamento quinzenal só começou em **07/2026**. Sem criar nenhuma funcionalidade, registrar no banco que as pendências de adiantamento de competências anteriores (até 06/2026) ficam **ignoradas**, com justificativa — usando o mecanismo já existente de ignorar pendências (`dp_pendencias_decisoes`).

## O que será feito (apenas banco, via SQL)

1. Localizar a empresa Pakerê (`companies.nome ilike '%paker%'`) e suas unidades com adiantamento ativo.
2. Para cada unidade, gerar as competências desde o início da cobrança (mês anterior ao cadastro da unidade) até **06/2026**.
3. Para cada colaborador elegível naquela competência (vínculo assalariado, não sócio, ativo na competência, optante de adiantamento) inserir em `dp_pendencias_decisoes`:
   - `pendencia_id`: `adiantamento-<id do colaborador>-<AAAA-M>` (mesmo formato gerado pela tela);
   - `acao`: `ignorar`;
   - `justificativa`: "Adiantamento implantado na empresa a partir de 07/2026";
   - `company_id`, `colaborador_id`, `competencia` preenchidos.
4. Cobrir também o caso de pendência de "lote completo" (`adiantamento-<id da unidade>-<AAAA-M>`), quando todos os elegíveis da unidade estavam pendentes naquela competência.
5. `ON CONFLICT (company_id, pendencia_id) DO NOTHING` para não duplicar.

## Efeito esperado

- Pendências de adiantamento anteriores a 07/2026 deixam de aparecer como cobrança na tela inicial, na lista de pendências e na importação de documentos (passam a constar como ignoradas, com a justificativa visível).
- Nada muda para 07/2026 em diante nem para contracheque, folha de ponto ou rescisão.

## Detalhes técnicos

- Uma única execução SQL (run_sql), sem migração de estrutura e sem alteração de código.
- A conferência respeita o formato de id usado em `src/hooks/useDpPendencias.tsx` (`compId` sem zero à esquerda no mês) e verifica se as telas de pendências do cadastro e da conferência de documentos leem as mesmas decisões.
