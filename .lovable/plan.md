# Data de início do adiantamento por unidade

## Problema

Na Pakerê o adiantamento quinzenal só passou a valer a partir de **07/2026**. Hoje a elegibilidade só considera cadastro da unidade, admissão, desligamento e opção do colaborador — então competências anteriores a 07/2026 podem gerar pendência de adiantamento indevida.

## Solução

Criar o campo **"Adiantamento a partir de"** (mês/ano) na configuração de adiantamento da unidade:

- Competências **anteriores** ao mês informado **nunca** geram pendência de adiantamento (mesmo para optantes).
- A partir do mês informado, valem as regras atuais (optante na competência, admissão, desligamento).
- Campo opcional: vazio = sem restrição (comportamento atual).
- Configurado no diálogo "Adiantamento da unidade" junto do dia de pagamento.

## Preenchimento inicial

Na mesma alteração de banco, todas as unidades da empresa Pakerê (localizada pelo nome) recebem o início **07/2026**, eliminando retroativamente pendências de adiantamento de competências anteriores.

## Detalhes técnicos

- Migração: `dp_unidades` ganha a coluna `adiantamento_inicio_competencia` (texto "YYYY-MM", nula por padrão); update definindo `'2026-07'` nas unidades da empresa cujo nome contenha "paker" (case-insensitive). Regenera os types.
- `src/lib/dp/pendencias-documentos.ts`: `ElegibilidadeOpts` ganha `adiantamentoInicioCompetencia`; no ramo `adiantamento` de `elegivelDocumento`, retorna `false` quando a competência for anterior ao início configurado.
- Chamadores repassam o valor da unidade (mesmo ponto onde já passam `diaAdiantamento`): `src/hooks/useDpPendencias.tsx`, `src/pages/dp/cadastros/DpCadastroPendencias.tsx` e `src/components/dp/documentos/DocConsistenciaPanel.tsx`.
- `src/components/dp/UnidadeAdiantamentoDialog.tsx` e `src/hooks/useDpCadastros.tsx` (payload de `useUpsertDpUnidade`): novo campo "Adiantamento a partir de" (seletor mês/ano), gravado junto com a regra.
- `src/test/unit/adiantamentoOpcao.test.ts`: casos de competência anterior/igual/posterior ao início configurado.
