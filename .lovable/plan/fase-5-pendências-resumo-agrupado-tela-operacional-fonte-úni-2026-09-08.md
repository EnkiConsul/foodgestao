# Fase 5 — Pendências (resumo agrupado, tela operacional, fonte única)

## Diagnóstico (verificado no código)

- `useDpPendencias` gera pendências individuais de ~14 fontes (solicitações, trocas, ocorrências, contracheque/adiantamento/folha de ponto por unidade, negociações, regras de folga, férias, ASO/EPI/treinamentos, escala, lotes, salário-família, dependentes, documentos obrigatórios por colaborador, cadastro incompleto).
- `PendenciasCard` (Home) lista **cada pendência individualmente** — sem agrupamento. É a poluição descrita no item 89.
- Tipo `Pendencia` não tem campos estruturados de colaborador/unidade (vão embutidos no `subtitulo`).
- KPI "Pendências abertas" (`KpiCards`) conta `data.length` **incluindo adiadas**, enquanto o card conta só as visíveis — definições divergentes (item 116).
- "Adiar" é individual e por usuário (`dp_user_prefs.pendencias_adiadas`) — será preservado como está.
- A rota `/dp/cadastros/pendencias` hoje é a **configuração de prazos** (`DpCadastroPendencias`), e o menu Cadastro → "Pendências" aponta para ela (conflito dos itens 107–109).
- **Performance (item 112):** N+1 confirmado — `hasDocsForUnidade` faz 1 query por unidade por tipo de documento; negociações fazem 1 query por par unidade×sindicato; colaboradores por unidade em loop.

## O que será feito

1. **Campos estruturados:** adicionar `colaboradorNome?` e `unidadeNome?` ao tipo `Pendencia` e preencher onde o dado já existe (solicitações, trocas, ocorrências, férias, ASO/EPI/treinamento, documentos, dependentes; unidade em contracheque/adiantamento/ponto/negociação/regras). Sem inventar informação.
2. **Fonte única (`src/lib/dp/pendencias.ts`):** helpers puros — `isPendenciaAdiada`, `filtrarAbertas`, `agruparPorTipo` (tipo → itens, contadores de atrasadas/vencem hoje/próximas, colaboradores distintos), urgência. Home, KPI e tela operacional usam a mesma fonte e a mesma definição de "aberta" (não adiada).
3. **Home agrupada (`PendenciasCard`):** um card por assunto (Documentos, Solicitações, Trocas, Férias, Folha de Ponto, Contracheque, ASO, etc. — somente os que existirem nos dados), cada um com quantidade, urgências visíveis (atrasadas/vencem hoje/próximas) e botão **Abrir** que abre o detalhe: itens individuais agrupados por colaborador quando aplicável, cada um com **Resolver** (destino próprio), **Detalhes** e **Adiar individual**. Sem "Adiar todas". Badge do card = pendências abertas (mesma definição do KPI). Empty state: "Nenhuma pendência aberta no momento."
4. **Nova tela operacional** `Cadastro → Pendências` (`/dp/cadastros/pendencias`): lista individual completa, desktop em tabela (Assunto, Colaborador, Unidade, Prazo, Situação, Urgência, Ação) e mobile em cards. Filtros por Assunto, Unidade, Colaborador, Situação (Abertas/Adiadas/Todas) e Urgência. Adiadas aparecem com selo "Adiada até dd/mm" e fora da contagem de abertas. Nasce com componentes existentes (padrão de tabela global da Fase 6 NÃO é antecipado).
5. **Reorganização da navegação:** a página atual de prazos move para `GERAL → Configurações → Prazos de Pendências` (nova rota `/dp/configuracoes/prazos-pendencias`, mesmo componente, sem perder regras/valores). Menu Cadastro → "Pendências" passa a abrir a lista operacional. Link para os prazos a partir da lista e da Home (ícone de engrenagem já existente passa a apontar para a nova rota). Como a rota antiga assume o novo significado previsto no plano, nenhum deep link quebra.
6. **KPI coerente:** "Pendências abertas" passa a contar apenas não adiadas (mesma definição do card e da tela).
7. **Performance:** eliminar N+1 — buscar colaboradores de todas as unidades em 1 query; documentos (contracheque/adiantamento/ponto) com 1 query agregada por tipo em vez de 1 por unidade; negociações com 1 query por empresa em vez de 1 por par unidade×sindicato. Regras de geração não mudam — só a forma de consultar.

## Fora de escopo (conforme plano mestre)

- Não alterar regras de geração de pendências (só organização/fonte/visualização).
- Não criar tipos novos de pendência; não mexer em Notificações, KPIs de outras telas, menu além dos dois pontos citados, Home além do card de pendências/KPI correspondente.
- Não antecipar Fase 6 (padrão global de tabelas densas).

## Validação

- Testes unitários da lib de agrupamento/urgência/adiadas; typecheck; suíte DP.
- Conferência visual desktop e mobile (390 px) da Home e da nova tela, sem overflow.
- Critérios do item 117 revisados um a um ao final. Parar ao fim da fase.

## Rollback

Tudo em código frontend + rotas; basta reverter os arquivos. Nenhuma migração de banco nesta fase.
