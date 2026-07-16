
# Plano — Auditoria Inicial do Módulo DP (Modo Auditoria)

Execução estritamente **somente leitura**. Nenhum arquivo será criado, editado ou removido. Nenhuma rota, componente, migration, policy, storage ou regra de negócio será alterada. O entregável desta rodada é um **relatório de diagnóstico** cobrindo apenas as três primeiras auditorias exigidas pelo prompt mestre.

## Escopo desta execução

1. **DP-G00 — Inventário técnico** do módulo DP atual.
2. **DP-G01 — Login** (adaptado ao 360°FOOD, sem copiar marca Pakerê).
3. **DP-G02 — Shell global e navegação** (sidebar admin + portal, header, menus, favoritos, notificações).
4. **Mapa completo** das telas DP existentes no projeto + rotas quebradas/duplicadas/inconsistentes identificadas.

Fora de escopo agora: DP-G03, DP-C0x, DP-A0x, importação de documentos, auditorias transversais DP-X0x. Serão tratadas em rodadas posteriores, uma tela por vez, após aprovação.

## Fontes de verdade

- **Prioridade 1** — branch `main` do repositório de referência `pakere1996/portalcolaborador` (rotas, páginas, componentes, campos, textos, fluxos, permissões, integrações).
- **Prioridade 2** — Componentes compartilhados da referência: `App.tsx`, `AppShell.tsx`, `NavigationCard.tsx`, `ColaboradorForm.tsx`, `ColaboradorFormDialog.tsx`, `DocumentImportForm.tsx`, `NotificationBell.tsx`, `PendenciasWidget.tsx`, `FavoritarBotao.tsx`, `src/components/ui/*`.
- **Prioridade 3** — `src/styles.css` e tokens/tailwind da referência (para hierarquia visual, não para copiar marca).
- **Prioridade 4** — `AI_RULES.md`, tipagens Supabase, migrations, edge functions, hooks. Conflitos com o código ativo em `main` são registrados, não corrigidos.

Diagnóstico prévio já existente em `.lovable/dp-diagnostico.md` será usado como ponto de partida e revisado, não como verdade final.

## Metodologia (por auditoria)

Para cada uma das três auditorias:

1. Ler as páginas/componentes correspondentes do repositório de referência via `raw.githubusercontent.com`.
2. Ler os equivalentes atuais no projeto (`src/pages/dp/**`, `src/components/dp/**`, `src/App.tsx`, rotas).
3. Preencher o **formato obrigatório** do prompt mestre (Identificação, Estrutura esperada, Estrutura encontrada, Matriz de divergências, Layout, Funcional, Formulários, Diálogos, Estados, Responsividade, Acessibilidade, Proposta de correção, Critérios de aceite, Decisão necessária).
4. Classificar cada item por **Status** (Conforme / Parcialmente / Divergente / Ausente / Extra / Não aplicável) e **Gravidade** (Bloqueadora / Crítica / Alta / Média / Baixa).
5. Registrar separadamente **Oportunidades de melhoria fora de escopo**.

## Entregável

Um único documento de auditoria salvo em `.lovable/auditoria/dp-inicial.md` contendo:

```text
├── DP-G00 — Inventário técnico
│   ├── Rotas DP atuais (admin + portal) x rotas esperadas
│   ├── Páginas em src/pages/dp/** e src/pages/dp/portal/**
│   ├── Componentes em src/components/dp/**
│   ├── Hooks useDp*
│   ├── Edge functions dp-*
│   ├── Tabelas dp_* (apenas listar, sem alterar)
│   ├── Storage buckets usados pelo DP
│   ├── Assets 360°FOOD utilizados
│   └── Rotas quebradas / duplicadas / menus apontando para rota errada
├── DP-G01 — Login
│   └── Relatório completo no formato obrigatório
├── DP-G02 — Shell global e navegação
│   └── Relatório completo no formato obrigatório
└── Mapa consolidado de telas DP + próximos passos sugeridos
```

Nenhum outro arquivo será tocado.

## Restrições reafirmadas

- Sem alterar código, rotas, banco, RLS, storage, regras de negócio.
- Sem redesenhar telas.
- Sem aplicar automaticamente correções.
- Sem copiar marca, textos institucionais ou dados da Pakerê.
- Preservar identidade 360°FOOD e semântica de cores de status.
- Não usar `window.alert`/`confirm` como referência de correção — apenas registrar se aparecerem.

## Decisão necessária ao final

O relatório termina com:

> Auditoria inicial concluída. Nenhuma alteração foi realizada. Aguardando aprovação para corrigir os itens identificados ou avançar para a primeira tela do portal do colaborador (DP-C01).

Opções que serão apresentadas:
- APROVAR TODAS AS CORREÇÕES DE DP-G00 / DP-G01 / DP-G02
- APROVAR PARCIALMENTE (informar IDs)
- REVISAR PROPOSTA
- REJEITAR CORREÇÕES
- AVANÇAR SEM CORRIGIR para DP-C01

## Detalhes técnicos

- Leitura da referência via `curl https://raw.githubusercontent.com/pakere1996/portalcolaborador/main/<path>` e `https://api.github.com/repos/pakere1996/portalcolaborador/git/trees/main?recursive=1` (sem escrever nada no repo).
- Leitura do projeto atual via `code--view` e `rg` (sem edição).
- Nenhuma migration, deploy de edge function, `supabase--insert` ou modificação de secret será executada.
- Nenhuma execução de Playwright é necessária nesta rodada (auditoria é estrutural/documental); se surgir necessidade de captura visual para comparar layout, será proposta em rodada específica.
