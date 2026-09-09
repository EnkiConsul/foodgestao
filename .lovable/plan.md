# Resolver pendência de documento abre a tela de Importar

## O que está acontecendo

As pendências de contracheque, folha de ponto e adiantamento apontam para o Histórico de documentos (`/dp/documentos/historico?tipo=...`). O botão "Resolver" leva a uma tela de consulta, não à tela onde o documento é enviado (`/dp/documentos`, "Importar").

## Como fica

- O botão "Resolver" dessas três pendências passa a abrir a tela **Importar**, já com a natureza e a competência da pendência indicadas no endereço (ex.: contracheque de julho/2026).
- A tela Importar mostra um aviso curto no topo: "Importando: Contracheque · julho/2026 · Pakerê T-63", para o gestor confirmar que está enviando o mês certo. O aviso pode ser fechado e não bloqueia nada.
- O Histórico continua acessível pelo atalho já existente na própria tela Importar; nada é removido.
- Demais pendências (férias, folgas, cadastro etc.) seguem com os destinos atuais.

## Detalhes técnicos

- `src/hooks/useDpPendencias.tsx`: trocar as três `url` de `/dp/documentos/historico?tipo=X` (e `/dp/documentos/adiantamento`, `/dp/documentos/ponto`, que redirecionam para o histórico) por `/dp/documentos?tipo=X&competencia=YYYY-MM&unidade=<id>`.
- `src/pages/dp/DpDocumentosImportar.tsx`: ler os parâmetros com `useSearchParams` e renderizar um alerta informativo acima do painel de importação (rótulo da natureza via `src/lib/dp/documentoTipos.ts`, nome da unidade via hook de unidades já usado no módulo). Nenhuma mudança no motor de importação, no `BulkImportPanel` nem nas edge functions.
- Sem alteração de rotas existentes, banco, RLS ou permissões.
- Testes: caso unitário garantindo que as pendências de documento apontam para `/dp/documentos` com natureza e competência; typecheck e suíte DP.
