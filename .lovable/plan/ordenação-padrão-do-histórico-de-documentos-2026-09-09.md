# Ordenação padrão do Histórico de Documentos

Ajustar a tela `/dp/documentos/historico` para que, ao carregar, a lista já venha ordenada por padrão assim:

1. Competência: mais recente primeiro (decrescente).
2. Unidade: ordem alfabética crescente (A–Z).
3. Nome do colaborador: ordem alfabética crescente (A–Z).
4. Tipo de documento: ordem alfabética crescente (A–Z).

## O que será alterado

- `src/pages/dp/DpHistoricoCompleto.tsx`
  - Adicionar uma chave de ordenação composta `"default"` ao tipo `SortKey`.
  - Trocar `defaultSortKey` para essa chave composta e manter `defaultSortDir` como `"desc"` (a competência governa a direção principal).
  - No `useMemo` de `sorted`, quando `sortKey === "default"`, aplicar sort multi-critério: `competencia_sort` desc, `unidade_nome` asc, `colaborador_nome` asc, `tipo_label` asc.
  - Quando o usuário clicar em uma coluna individual, o comportamento continua o atual: ordena por aquela coluna.
  - Incluir no menu de cada coluna uma opção "Restaurar ordenação padrão" para voltar ao sort composto.

- `src/hooks/useDpTableColumns.tsx`
  - Permitir que `defaultSortKey` seja uma chave válida mesmo que não esteja entre as colunas existentes, sem quebrar a detecção de `sortAtivo`.

## Validação

- `bunx tsgo --noEmit -p tsconfig.json` deve passar.
- Verificar no preview se a lista carrega na nova ordem e se os sorts individuais das colunas ainda funcionam.
