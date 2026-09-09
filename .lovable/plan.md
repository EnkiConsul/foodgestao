# Botão "Resolver" das pendências: abrir sempre a tela certa

## O problema

Ao clicar em "Resolver" na pendência do contracheque, abre o **Histórico de documentos** (tela de consulta) e não a tela **Importar**, onde o documento é realmente enviado. Revisando todas as pendências, várias levam apenas à tela geral do assunto, deixando o gestor procurar o item.

## Destinos revisados

| Pendência | Hoje | Passa a abrir |
|---|---|---|
| Contracheque / Folha de ponto / Adiantamento não importado | Histórico de documentos | Tela **Importar**, com natureza, competência e unidade indicadas |
| Unidade não identificada no lote | Importar (genérico) | Importar já com o lote em revisão aberto |
| Documentos obrigatórios / aguardando aprovação / vencendo de um colaborador | Lista de colaboradores | Ficha do colaborador na aba **Documentos** |
| Adicional/dependente do colaborador | Lista de colaboradores | Ficha do colaborador na aba correspondente |
| Completar cadastro | Ficha na aba Dados | Mantido (já correto) |
| Férias vencidas / a vencer | Tela de Férias | Férias com o colaborador filtrado |
| ASO / EPI / Treinamento | Conformidade | Conformidade já na aba certa (exames, EPIs ou treinamentos) e com busca pelo colaborador |
| Negociação coletiva pendente | Lista de unidades | Cadastro da unidade aberto na aba de sindicato/negociação |
| Regras de folgas | Folgas, aba Regras | Mantido; quando for de uma unidade, já com a unidade selecionada |
| Solicitações / Trocas | Folgas nas abas certas | Mantido (já correto) |
| Escala do próximo mês | Escalas | Escalas já no mês seguinte |
| Ocorrências | Ocorrências | Mantido (já aceita colaborador e data) |
| Salário-família | Cargos, aba Complementos | Mantido (já correto) |

Na tela de Importar aparece um aviso curto no topo ("Importando: Contracheque · julho/2026 · Pakerê T-63"), que pode ser fechado e não bloqueia nada. Nenhuma regra, permissão ou cálculo muda — só o destino do botão.

## Detalhes técnicos

- `src/hooks/useDpPendencias.tsx`: ajustar as `url` conforme a tabela, sempre com parâmetros de consulta (`?tipo=&competencia=&unidade=`, `?editar=<id>&aba=documentos`, `?colaborador=<id>`, `?aba=<tab>&editar=<id>`, `?mes=YYYY-MM`, `?lote=<id>`). Nenhuma mudança na geração, agrupamento ou urgência das pendências.
- `src/pages/dp/DpDocumentosImportar.tsx`: ler `tipo`, `competencia`, `unidade` e `lote` via `useSearchParams`; exibir o aviso informativo (rótulo da natureza de `src/lib/dp/documentoTipos.ts`, nome da unidade pelo hook de unidades já usado) e, com `lote`, abrir a revisão do lote correspondente no `BulkImportPanel` via prop opcional. Motor de importação e edge functions inalterados.
- Telas que ainda não leem parâmetros: `DpUnidades.tsx` (aceitar `editar` e `aba`), `DpConformidade.tsx` (aceitar `aba` e `colaborador`), `DpEscalas.tsx` (aceitar `mes`). `DpFerias.tsx`, `DpColaboradores.tsx` e `DpFolgasHub.tsx` já usam `useSearchParams` — apenas estender para os novos parâmetros (`colaborador`, `aba=documentos`, `unidade`).
- Sem alteração de rotas existentes (redirects legados permanecem), banco, RLS, permissões ou multiempresa.
- Testes: caso unitário verificando os destinos gerados por tipo de pendência (documentos → `/dp/documentos` com natureza+competência; colaborador → `editar=<id>&aba=documentos`; férias/conformidade com colaborador); typecheck e suíte DP.
