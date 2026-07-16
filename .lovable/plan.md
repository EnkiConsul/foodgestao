# Auditoria DP — status

Concluídas: DP-G00→G08 (correções aplicadas).
Em andamento: **DP-G09 — Comunicação (Avisos, Mensagens, Modelos, Notificações) + Documentos gerais** (relatório em `.lovable/auditoria/dp-g09-comunicacao-documentos.md`). 27 divergências mapeadas em 5 grupos. Nenhuma alteração aplicada — aguardando aprovação.

Sequência sugerida pelo prompt mestre:

## DP-G03 — Home / Meu Cadastro do Portal (`/dp/meu`)

Auditar as telas de entrada do colaborador contra a referência `pakere1996/portalcolaborador`:

1. **`/dp/meu` (DpHome)** — cards de resumo, saudação, atalhos, avisos, atestados pendentes.
2. **`/dp/meu/cadastro`** — dados pessoais, documentos, endereço, contatos, dependentes, dados bancários, contrato.
3. **Hooks/queries** — `useDpMeuResumo`, leitura de `dp_colaboradores`, `dp_cargos`, `dp_departamentos`, `dp_dependentes`, `dp_documentos_colaborador`.

### Entregáveis (somente leitura)

- `.lovable/auditoria/dp-g03-portal-cadastro.md` com:
  - Inventário de campos/sessions exibidos vs. esperados pela doc.
  - Divergências classificadas (Conforme / Parcial / Divergente / Ausente / Extra) + gravidade.
  - Mapa de leitura de tabelas `dp_*` e RLS relevante.
  - Propostas de correção enumeradas (DIV-G03-XX) sem aplicar.
- Atualização de `.lovable/plan.md` marcando DP-G02 como concluída e G03 em andamento.

### Fora do escopo desta fase

- Formulários de edição (Folgas, Trocas, Atestados) — ficam para DP-G04+.
- Área admin (`/dp/*`) — auditada em fase separada após portal completo.
- Nenhuma migration, alteração de RLS, código ou storage.

## Fases posteriores (visão geral)

- DP-G04 — Folgas do colaborador (calendário, solicitação, trocas, histórico).
- DP-G05 — Documentos do colaborador (meus documentos, atestados, disciplinar, sindicato).
- DP-G06 — Área admin: dashboard + colaboradores.
- DP-G07 — Área admin: folgas, escalas, atestados, disciplinar.
- DP-G08 — Área admin: cargos, departamentos, sindicatos, configurações.

Finalizo cada fase com relatório em `.lovable/auditoria/` e aguardo aprovação antes de aplicar correções.

Confirma iniciar por **DP-G03 (Portal — Home + Meu Cadastro)**?

## DP-G08 — Concluída (16/07/2026)

Todos os 5 grupos aplicados:

- **G1** — bugs de runtime: rótulo Salvar duplicado, botão PDF sem onClick, race condition em vínculos sindicais, cores hardcoded em badges.
- **G2** — `AlertDialogDescription` em Unidades, Sindicatos, Cargos e Negociações.
- **G3** — `useUpsertDpSindicato` retorna id via `.insert().select("id").single()`; fim do fallback por nome+tipo.
- **G4** — busca em Unidades/Sindicatos/Cargos, filtro Ativa/Inativa em Unidades, filtro Vigente/Expirado em Negociações, contadores (unidades/cargos por sindicato, colaboradores por cargo), badges de patronal/laboral mais distintas, botão Editar no view dialog de Unidades, spinner BrasilAPI, remoção de `ArrowLeft` acima do `DpPageHeader`.
- **G5** — nova página `/dp/configuracoes` (`DpConfiguracoes.tsx`) com editor de `dp_dia_config` (data + limite + observação) e atalho para bloqueios; card informando que SLAs seguem o padrão do sistema.
- **Hub de Cadastros** ganhou atalhos para Negociações sindicais e Configurações.

**Próxima fase sugerida:** DP-G09 — Comunicação (Avisos, Mensagens, Modelos, Notificações) + Documentos gerais.
