# Fase 6 — Padrão Global de Tabelas

## Contexto

Fases 1–5 do plano mestre concluídas. A Fase 6 (itens 118–155) padroniza as tabelas densas do sistema com filtro no cabeçalho, ordenação, drag de coluna, redimensionamento, mostrar/ocultar colunas e persistência de layout — reutilizando o padrão que já existe na tela de Colaboradores, sem criar sistema concorrente.

## Diagnóstico confirmado (pré-plano)

- Já existe o padrão de referência: `DpTableColumnHeader` + hook `useDpTableColumns` (filtro no cabeçalho, ordenação, drag, resize com `DP_COL_MIN_WIDTH`, truncamento), usado hoje em `DpColaboradores`, `DpHistoricoCompleto` e `DpConformidadeDsr`.
- Persistência atual: `localStorage` por dispositivo + `app_table_layouts` (padrão global salvo por super admin via `DpSalvarLargurasButton`). Não há preferência individual por usuário+empresa no backend.
- `dp_user_prefs` é por `user_id + company_id` e já usa merge seguro de `extras` (favoritos de páginas, atalhos mobile, avisos) — encaixa no requisito de preferência individual sem migration nova.
- Faltam hoje: mostrar/ocultar colunas, "Restaurar Padrão", autosave individual por usuário+empresa+tela e aplicação do padrão nas demais tabelas densas (incl. Financeiro).

## Escopo

1. **Inventário dirigido**: mapear somente as tabelas densas que recebem o padrão (Pessoas 360 e Financeiro). Não aplicar em tabelas pequenas, listas simples, cards ou telas mobile.
2. **Evoluir `useDpTableColumns` / `DpTableColumnHeader`** (sem criar sistema paralelo):
   - Mostrar/ocultar colunas (controle "Colunas"), com colunas essenciais protegidas por tabela (não permitir tela sem contexto);
   - Autosave de ordem, largura e visibilidade em `dp_user_prefs.extras.table_layouts["<tela>"]`, por usuário+empresa+tela, com merge seguro (não apagar favoritos, atalhos, avisos, layouts de outras telas);
   - Gravação no fim do resize (não a cada pixel) e proteção de concorrência entre autosaves em sequência;
   - "Restaurar Padrão": remove só a preferência daquela tela e volta ao padrão canônico (incl. o padrão global de `app_table_layouts`, quando houver);
   - Sem botão "Salvar Visualização"; localStorage vira apenas cache local;
   - Colunas fixas documentadas por tabela (checkbox, Nome/Descrição, Ações) — Ações fixa, sem filtro, sempre acessível.
3. **Aplicar o padrão nas tabelas densas do inventário** (Pessoas 360 e Financeiro), com filtro no cabeçalho apenas em colunas com semântica de filtro (nunca em Ações/ícones/checkbox) e ordenação coerente preservando regras atuais.
4. **Paginação + filtro**: nas tabelas com paginação server-side, traduzir o filtro de coluna para a query (atuando sobre o conjunto total, respeitando company_id, permissões, índices, paginação e ordenação), com debounce em campos textuais. Filtros temporários não são persistidos.
5. **Financeiro sem alteração de lógica**: nenhuma mudança em valores, cálculos, saldos, status, DRE, Fluxo de Caixa, conciliação, categorias, pagamentos ou recebimentos; colunas monetárias preservam alinhamento, moeda e negativos.
6. **Mobile**: sem drag/resize; tabelas densas seguem o padrão de cards/lista; a preferência de colunas do desktop não quebra o card mobile.
7. **Acessibilidade**: foco, labels, contraste e indicação visual preservados em resize/reordenação.

## Testes e evidências

- Testes unitários do merge/persistência de layout, mostrar/ocultar, essenciais, reset e concorrência.
- Por padrão representativo: resize → reload → largura salva; reordenar → reload; ocultar/exibir; restaurar padrão; outro usuário e outra empresa isolados; tabela paginada + filtro; filtro + ordenação; mobile.
- Playwright desktop e 390px nas telas alteradas; typecheck e suíte de testes.

## Rollback

Sem migration nova prevista (reuso de `dp_user_prefs.extras`); rollback = reverter os arquivos de componentes/hooks/páginas. Se alguma migration for necessária, será additive e reversível.

## Fora do escopo

Não iniciar Fases 7–10. Não repetir a auditoria geral de UX. Não alterar regras de negócio, valores ou permissões. Parar ao final da Fase 6.

## Detalhes técnicos

- Reuso: `src/components/dp/DpTableColumnHeader.tsx`, `src/hooks/useDpTableColumns.tsx`, `src/hooks/useDpUserPrefs.tsx`, tabela `app_table_layouts` (padrão global).
- Chave de preferência: `extras.table_layouts` com chaves por tela (ex.: `dp-colaboradores`, `financeiro-lancamentos`).
- Sem nova tabela; `dp_user_prefs` já tem RLS e unique por (user_id, company_id).
