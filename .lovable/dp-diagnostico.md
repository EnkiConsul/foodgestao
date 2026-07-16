# Diagnóstico: Doc de referência × Implementação atual do Módulo DP

Fonte doc: /tmp/dpdoc/ (repo pakere1996/portalcolaborador). Fonte atual: /dev-server/src/pages/dp/ e /dev-server/src/components/dp/.

---

### Início Admin (/dp)
- **Arquivo doc:** adm_HomeAdmin.tsx (113 linhas)
- **Arquivo atual:** src/pages/dp/DpHome.tsx (27 linhas)
- **Estrutura da doc:** Header com h1 "Painel Administrativo". Grid `lg:grid-cols-2` com cards de atalho (ex.: link para atestados). Sem tabs.
- **Estrutura atual:** DpPageHeader + grid `lg:grid-cols-2` reaproveitando componentes de `home/`.
- **Divergências:** 1) estrutura similar (grid 2 col); 2) doc não usa DpPageHeader (componente próprio do projeto, ok); 3) fluxo equivalente; 4) N/A; 5) atual é bem mais enxuto (27 linhas) — verificar se todos os atalhos da doc existem nos componentes filhos de `home/`.
- **Ação sugerida:** Conferir se os cards de atalho de `home/` cobrem os mesmos destinos da doc (atestados, aprovações, avisos).
- **Toca no banco?** Não.

### Cadastro Hub (/dp/cadastros)
- **Arquivo doc:** adm_CadastroHub.tsx (57 linhas)
- **Arquivo atual:** DpCadastrosHub.tsx (25 linhas)
- **Estrutura da doc:** h1 + grid `sm:grid-cols-2 lg:grid-cols-3` de NavigationCards para Colaboradores/Cargos/Unidades/Sindicatos.
- **Estrutura atual:** DpPageHeader + grid `sm:grid-cols-2 lg:grid-cols-3`, mesmo conjunto de cards.
- **Divergências:** estrutura equivalente; nenhuma divergência relevante encontrada.
- **Ação sugerida:** Nenhuma ação prioritária.
- **Toca no banco?** Não.

### Colaboradores (/dp/colaboradores)
- **Arquivo doc:** adm_Colaboradores.tsx (698 linhas)
- **Arquivo atual:** DpColaboradores.tsx (267 linhas)
- **Estrutura da doc:** h1, botão "Novo Colaborador" (rounded-full), grid de filtros `md:grid-cols-2`, tabela/lista de colaboradores com ações (Editar/Redefinir Senha/Excluir), Dialog de cadastro/edição (form em grid), AlertDialog de exclusão, 4 Badges de status.
- **Estrutura atual:** DpPageHeader, botão "Novo" (rounded-full), grid de filtros `md:grid-cols-4`, tabela com ações Editar/Resetar acesso/Remover, dialog via `ColaboradorFormDialog` (componente extraído).
- **Divergências:** 1) estrutura similar; 2) doc usa grid de filtros 2 colunas vs atual 4 colunas — pode compactar diferente em mobile; 3) fluxo equivalente (dialog + alertdialog); 4) doc tem 4 filtros de Badge que precisam ser conferidos contra os filtros atuais; 5) nenhuma tela faltando.
- **Ação sugerida:** Validar paridade dos filtros e dos badges de status (ativo/inativo/férias etc.).
- **Toca no banco?** Possível — conferir se todos os campos do form da doc (698 linhas indica formulário extenso) existem na tabela `dp_colaboradores` atual.

### Cargos (/dp/cadastros/cargos)
- **Arquivo doc:** adm_Cargos.tsx (357 linhas)
- **Arquivo atual:** DpCargos.tsx (264 linhas)
- **Estrutura da doc:** h1, botão "Novo Cargo" (rounded-full), lista em grid-cols-1, Dialog de form, AlertDialog de exclusão, ações Editar/Excluir com `title=`.
- **Estrutura atual:** DpPageHeader, botão + rounded-full, grid-cols-2 (detalhe interno), ações Editar/Excluir iguais.
- **Divergências:** 1) doc usa lista vertical (grid-cols-1) para itens principais, atual usa grid-cols-2 só dentro do card — checar se a lista principal também virou grid ao invés de lista; 2) nenhuma divergência visual grave; 3) fluxo igual; 4) N/A; 5) nenhuma.
- **Ação sugerida:** Conferir layout da listagem principal (lista x grid).
- **Toca no banco?** Não aparente.

### Unidades (/dp/cadastros/unidades)
- **Arquivo doc:** adm_Unidades.tsx (1278 linhas)
- **Arquivo atual:** DpUnidades.tsx (515 linhas)
- **Estrutura da doc:** h1, botão rounded-full, badges coloridos (bg-blue-100/bg-purple-100) para tipo, 5 Dialogs (cadastro unidade, "Novo cargo", "Novo sindicato laboral" inline, etc.), AlertDialog de exclusão, grids `md:grid-cols-2` para detalhes.
- **Estrutura atual:** DpPageHeader, botão rounded-full, badges azul/roxo iguais, dialogs de detalhe com grid `md:grid-cols-2`, border-dashed para estado vazio de vínculos.
- **Divergências:** 1) doc tem 5 Dialogs distintos (unidade + criação rápida de cargo + sindicato dentro do mesmo fluxo) — atual parece ter menos dialogs (verificar se "Novo cargo"/"Novo sindicato" inline existem); 2) cores de badge conferem; 3) fluxo de criação rápida (cargo/sindicato a partir da tela de unidade) pode estar ausente; 4) N/A; 5) possível funcionalidade faltando (criação rápida inline).
- **Ação sugerida:** Verificar se atual permite criar cargo/sindicato diretamente da tela de Unidades (atalho inline) como na doc.
- **Toca no banco?** Não (reaproveita tabelas existentes), mas fluxo de criação inline precisa de handlers extras.

### Sindicatos Hub (/dp/cadastros/sindicatos — hub)
- **Arquivo doc:** adm_SindicatosHub.tsx (45 linhas)
- **Arquivo atual:** não existe um hub dedicado — DpSindicatos.tsx (375 linhas) já combina cadastro.
- **Estrutura da doc:** h1 + grid `sm:grid-cols-2` com 2 cards (Cadastro de Sindicatos / Negociações).
- **Estrutura atual:** DpSindicatos.tsx entra direto em duas colunas "Patronais"/"Laborais" sem hub intermediário; Negociações é rota separada (DpSindicatoNegociacoes).
- **Divergências:** 1) doc tem uma camada de hub extra ausente no atual (navegação direta ao invés de hub com 2 cards); 2) N/A; 3) fluxo de navegação simplificado no atual (pode ser intencional); 4) N/A; 5) hub "sobrando" na doc / "faltando" no atual, mas non-crítico.
- **Ação sugerida:** Decidir se vale criar um DpSindicatosHub simples antes de Cadastro/Negociações, para espelhar a doc, ou manter fluxo direto atual (mais enxuto).
- **Toca no banco?** Não.

### Cadastro de Sindicatos (/dp/cadastros/sindicatos)
- **Arquivo doc:** adm_SindicatosCadastro.tsx (639 linhas)
- **Arquivo atual:** DpSindicatos.tsx (375 linhas)
- **Estrutura da doc:** h1, duas colunas "Patronais"/"Laborais" (grid `lg:grid-cols-2`), cards com CardTitle, empty state dashed border rounded-xl, Dialog de cadastro/edição, AlertDialog exclusão, grids internos `grid-cols-2` para vínculos (checkbox de unidades).
- **Estrutura atual:** mesmas duas colunas, mesmos empty states dashed, mesmos grids de vínculo `grid-cols-2 max-h-40 overflow-y-auto`.
- **Divergências:** estrutura muito próxima; nenhuma divergência relevante.
- **Ação sugerida:** Nenhuma prioritária.
- **Toca no banco?** Não.

### Negociações Sindicais (/dp/documentos/act-cct)
- **Arquivo doc:** adm_SindicatosNegociacoes.tsx (649 linhas)
- **Arquivo atual:** DpSindicatoNegociacoes.tsx (312 linhas)
- **Estrutura da doc:** h1, filtros grid, empty state dashed rounded-xl "border-dashed p-12", cards com CardTitle, Dialog de cadastro com grid-cols-2, badge de anexo PDF.
- **Estrutura atual:** DpPageHeader, filtros `md:grid-cols-3`, dialog com grids `grid-cols-3`/`grid-cols-2`, botão "PDF anexado" com ícone.
- **Divergências:** 1) doc usa 3 colunas nos filtros vs atual também 3 — ok; 2) estilo geral convergente; 3) fluxo similar; 4) conferir se filtro por sindicato/unidade está presente igual à doc; 5) nenhuma faltando.
- **Ação sugerida:** Validar detalhes do dialog (campos de vigência, valor, anexo) item a item.
- **Toca no banco?** Possível campo de anexo PDF — confirmar coluna de arquivo na tabela de negociações.

### Folgas Hub (/dp/folgas)
- **Arquivo doc:** adm_FolgasHub.tsx (269 linhas)
- **Arquivo atual:** DpFolgasHub.tsx (216 linhas)
- **Estrutura da doc:** h1, botão FAB "rounded-full shadow-lg", grid `md:grid-cols-3 xl:grid-cols-6` de indicadores, seção "Ocupação dos Próximos Fins de Semana" com barra de progresso (`h-2 bg-muted rounded-full`), destaque para aniversariante com prioridade (ícone com title).
- **Estrutura atual:** DpPageHeader, grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` de indicadores, seção "Ocupação dos Próximos Fins de Semana" com título igual.
- **Divergências:** 1) estrutura muito próxima; 2) conferir presença do destaque "aniversariante com prioridade" (ícone com tooltip) no atual; 3) fluxo equivalente; 4) N/A; 5) feature de "prioridade de aniversariante" pode estar ausente.
- **Ação sugerida:** Adicionar indicador visual de aniversariante com prioridade se ausente.
- **Toca no banco?** Sim, se não houver — precisa de campo de data de nascimento/prioridade já usado em regras de folga (verificar `dp_colaboradores.data_nascimento`).

### Calendário Geral (/dp/folgas/calendario)
- **Arquivo doc:** adm_Calendario.tsx (789 linhas)
- **Arquivo atual:** DpFolgas.tsx (769 linhas) — rota /dp/folgas/calendario
- **Estrutura da doc:** h1 estilizado "text-4xl font-black tracking-tight", grid de indicadores `grid-cols-2 md:grid-cols-4`, grade semanal customizada, empty state "rounded-[2rem] border-dashed", ao clicar num dia abre **Dialog** grande (`rounded-[2.5rem] border-none shadow-2xl p-8`) com título replicando estilo do h1, listagem de ocupantes do dia, botões de ação (bloquear, adicionar folga, ver detalhes), AlertDialog de confirmação para ações destrutivas.
- **Estrutura atual:** DpFolgas.tsx tem grid de indicadores `grid-cols-2 lg:grid-cols-4`, grid 7 colunas (semana) com bordas via `hsl(var(--dp-border))`, empty state `rounded-xl border-2 border-dashed`, dialog ao clicar no dia (`sm:max-w-lg`) com título "dd/MM/yyyy" e lista de eventos.
- **Divergências:** 1) estrutura macro igual (indicadores + grade + dialog de dia); 2) design do popup na doc é muito mais estilizado (`rounded-[2.5rem]`, `shadow-2xl`, tipografia `font-black text-3xl`) vs atual mais discreto (`sm:max-w-lg`, `text-3xl font-bold`) — diferença de "peso visual"; 3) doc tem AlertDialog extra de confirmação de ações dentro do popup do dia que precisa ser conferido no atual; 4) filtros de indicadores (`grid-cols-4`) — atual usa `lg:grid-cols-4`, doc usa `md:grid-cols-4`, breakpoint diferente; 5) nenhuma tela faltando.
- **Ação sugerida:** Ajustar breakpoint dos indicadores para `md:` e avaliar se vale aumentar o raio/peso visual do popup do dia para casar com a doc (esse é o "popup padrão" citado no pedido do usuário, candidato a componente reutilizável).
- **Toca no banco?** Não.

### Solicitações (/dp/solicitacoes)
- **Arquivo doc:** adm_Solicitacoes.tsx (146 linhas)
- **Arquivo atual:** DpSolicitacoes.tsx (231 linhas)
- **Estrutura da doc:** h1, duas seções fixas "Pendentes" e "Histórico" (sem Tabs, apenas dois `<h2>` sequenciais com listas filtradas em JS: `pendentes` / `outras`), badge de status colorido (`bg-available/20`/`bg-unavailable/20`).
- **Estrutura atual:** DpPageHeader + **Tabs** com 4 abas (Pendentes/Aprovadas/Recusadas/Todas), tabela com botão "Ver arquivo".
- **Divergências:** 1) diferença de hierarquia: doc usa duas seções empilhadas sem tabs, atual usa componente Tabs com 4 estados; 2) cores de badge diferentes (doc usa tokens `available`/`unavailable`, atual pode usar outra paleta — conferir); 3) fluxo do atual é mais rico (permite filtrar Aprovadas/Recusadas separadamente) — divergência de fluxo, não necessariamente regressão; 4) doc não tem filtro por tipo, atual pode ter; 5) nenhuma faltando.
- **Ação sugerida:** Decisão de produto: manter Tabs (mais funcional) documentando divergência intencional, ou simplificar para 2 seções como a doc.
- **Toca no banco?** Não.

### Aprovações (/dp/aprovacoes)
- **Arquivo doc:** adm_Aprovacoes.tsx (101 linhas)
- **Arquivo atual:** DpAprovacoes.tsx (148 linhas)
- **Estrutura da doc:** h1 simples, sem Tabs nem Dialog detectados (fluxo provavelmente com lista única e ações inline).
- **Estrutura atual:** DpPageHeader + Tabs (Pendentes/Todas).
- **Divergências:** 1) atual introduz Tabs que não existem na doc; 2) N/A; 3) divergência de fluxo (segmentação por aba vs lista única); 4) N/A; 5) nenhuma faltando.
- **Ação sugerida:** Confirmar se a segmentação por Tabs é desejada (parece melhoria) ou se deve ser revertida para lista única conforme doc.
- **Toca no banco?** Não.

### Trocas (/dp/trocas)
- **Arquivo doc:** adm_Trocas.tsx (130 linhas)
- **Arquivo atual:** DpTrocas.tsx (248 linhas)
- **Estrutura da doc:** h1, 1 Badge, sem Dialog aparente (provavelmente aprovação inline).
- **Estrutura atual:** DpPageHeader, usa DpContentCard/DpEmptyState, 2 grids internos `grid-cols-2` (detalhe da troca), empty state customizado.
- **Divergências:** 1) atual tem estrutura mais elaborada com cards e empty state dedicado — possível evolução além da doc; 2) uso de `DpContentCard`/`DpEmptyState` é um padrão do projeto não presente na doc (ok, é componentização local); 3) fluxo pode ter mais detalhe (grids de origem/destino da troca) que a doc não evidencia; 4) N/A; 5) nenhuma faltando, atual parece mais completo.
- **Ação sugerida:** Nenhuma ação crítica; validar se textos/rótulos batem com a doc.
- **Toca no banco?** Não aparente.

### Bloqueios (/dp/bloqueios)
- **Arquivo doc:** adm_Bloqueios.tsx (924 linhas)
- **Arquivo atual:** DpBloqueios.tsx (184 linhas)
- **Estrutura da doc:** h1, botões "Nova regra" e "Bloquear data" (rounded-full), duas subseções com `<h2>` (regras / datas), badges de tipo (`bg-primary/10 rounded-full`), Dialogs de criação de regra e de data com grids de seleção (`grid-cols-3`/`grid-cols-7`/`grid-cols-2` para dias da semana/meses/unidades), AlertDialog de exclusão.
- **Estrutura atual:** DpPageHeader, usa DpContentCard/DpEmptyState, grid `grid-cols-2` para detalhe do bloqueio, empty state com ícone Ban.
- **Divergências:** 1) diferença grande de tamanho (924 vs 184 linhas) sugere que a doc tem fluxo de "regras recorrentes" (por dia da semana/mês) que o atual pode não implementar — provável funcionalidade ausente; 2) badges de tipo `bg-primary/10 rounded-full` vs atual não confirmado; 3) doc tem 2 fluxos de criação (regra recorrente vs data pontual) via botões distintos, atual parece ter só bloqueio simples; 4) seletor de dias da semana/meses em grid não visto no atual; 5) **possível funcionalidade faltando**: regras recorrentes de bloqueio.
- **Ação sugerida:** Levantar com o time se "regras recorrentes de bloqueio" (por dia da semana, mês, unidade) é necessário; se sim, expandir tela e formulário.
- **Toca no banco?** Sim — precisaria de tabela/colunas para tipo de regra (recorrente x pontual), dias da semana, meses aplicáveis, escopo por unidade.

### Hub Documentos (/dp/documentos)
- **Arquivo doc:** adm_Documentos.tsx (90 linhas)
- **Arquivo atual:** DpDocumentosHub.tsx (78 linhas)
- **Estrutura da doc:** h1 + grid `sm:grid-cols-2` de cards de categoria (Contracheque, Adiantamento, Ponto, Atestados, Disciplinar, ACT/CCT, Histórico).
- **Estrutura atual:** DpPageHeader + grid `sm:grid-cols-2 lg:grid-cols-3` com cards, incluindo "Negociações Coletivas (ACT/CCT)" e "Histórico completo".
- **Divergências:** estrutura equivalente; atual adiciona breakpoint lg extra (positivo).
- **Ação sugerida:** Nenhuma prioritária.
- **Toca no banco?** Não.

### Contracheque / Adiantamento / Ponto Admin
- **Arquivo doc:** adm_DocumentosContracheque.tsx, adm_DocumentosAdiantamento.tsx, adm_DocumentosPontoAdmin.tsx (18 linhas cada — stubs simples, provavelmente reaproveitam um componente genérico de categoria de documento).
- **Arquivo atual:** não existe arquivo dedicado; DpDocumentos.tsx (250 linhas) parece tratar essas categorias de forma unificada (por rota/param), rotas `/dp/documentos/contracheque`, `/dp/documentos/adiantamento`, `/dp/documentos/ponto` apontadas na sidebar.
- **Estrutura da doc:** cada stub provavelmente instancia um componente genérico de listagem de documentos por categoria com upload e tabela.
- **Estrutura atual:** DpDocumentos.tsx com grid `grid-cols-2` internos, provavelmente com prop de categoria.
- **Divergências:** 1) doc modela cada categoria como página própria (ainda que fina), atual unifica em componente único parametrizado — hierarquia diferente mas resultado provavelmente equivalente; 2) N/A; 3) fluxo deve ser igual; 4) N/A; 5) nenhuma faltando, apenas organização de arquivos diferente.
- **Ação sugerida:** Nenhuma ação de UI necessária; apenas confirmar que as 3 categorias têm parâmetros e textos corretos dentro de DpDocumentos.tsx.
- **Toca no banco?** Não.

### Histórico Completo de Documentos (/dp/documentos/historico)
- **Arquivo doc:** adm_DocumentosHistoricoCompleto.tsx (748 linhas)
- **Arquivo atual:** DpHistoricoCompleto.tsx (197 linhas)
- **Estrutura da doc:** h1, Card de "Filtros" com CardTitle, grid de filtros `md:grid-cols-2 até xl:grid-cols-6`, badges (10 ocorrências, provavelmente por tipo de doc), empty state `rounded-2xl border-dashed p-12`, Dialog de "Visualização do documento", ações Visualizar/Baixar com `title=`.
- **Estrutura atual:** DpPageHeader, grid de filtros `md:grid-cols-5`, ações Pré-visualizar/Baixar com `title=`, preview via componente `setPreview` (usa `DocumentPreview.tsx`).
- **Divergências:** 1) doc usa Card dedicado para o bloco de filtros (com CardHeader/CardTitle "Filtros"), atual não confirma envolver os filtros em Card; 2) grid de filtros doc vai até 6 colunas em telas grandes, atual só até 5; 3) fluxo de preview equivalente (dialog/preview component); 4) confirmar filtros disponíveis (tipo, colaborador, unidade, período, status) — doc parece ter mais (6 filtros) que atual (5); 5) nenhuma tela faltando.
- **Ação sugerida:** Envolver bloco de filtros em Card com título "Filtros" e revisar se falta 1 filtro para bater com a doc.
- **Toca no banco?** Não, apenas UI/query de filtro.

### Atestados (/dp/documentos/atestado)
- **Arquivo doc:** adm_AtestadosAdmin.tsx (179 linhas)
- **Arquivo atual:** DpAtestados.tsx (200 linhas)
- **Estrutura da doc:** h1, sem Tabs/Dialog detectados nos regex (fluxo provavelmente lista única com ações inline de aprovar/recusar).
- **Estrutura atual:** DpPageHeader + Tabs (Pendentes/Aprovados/Recusados/Todos), botões Pré-visualizar/Aprovar/Recusar com `title=`.
- **Divergências:** 1) atual introduz Tabs de status que a doc não usa (lista única); 2) N/A; 3) divergência de fluxo de navegação/segmentação; 4) N/A; 5) nenhuma faltando — atual parece mais robusto.
- **Ação sugerida:** Confirmar se a segmentação por Tabs é intencional (recomendado manter, pois melhora usabilidade); documentar divergência.
- **Toca no banco?** Não.

### Registros Disciplinares (/dp/disciplinar)
- **Arquivo doc:** adm_RegistrosDisciplinaresAdmin.tsx (115 linhas)
- **Arquivo atual:** DpDisciplinar.tsx (243 linhas)
- **Estrutura da doc:** h1 simples, sem Tabs/Dialog/Card detectados (lista simples, provavelmente com geração de PDF automática).
- **Estrutura atual:** DpPageHeader, grid `grid-cols-2` de detalhe, botão "Gerar PDF automaticamente" com `title`, ação de excluir.
- **Divergências:** 1) estrutura do atual mais elaborada com grid de detalhes; 2) N/A; 3) fluxo de geração de PDF presente em ambos (nome do botão bate); 4) N/A; 5) nenhuma faltando.
- **Ação sugerida:** Nenhuma ação crítica.
- **Toca no banco?** Não.

### Comunicação Hub (/dp/comunicacao)
- **Arquivo doc:** adm_ComunicacaoHub.tsx (56 linhas)
- **Arquivo atual:** DpComunicacaoHub.tsx (38 linhas)
- **Estrutura da doc:** h1 + grid `sm:grid-cols-2` de 2 cards (Mensagens, Quadro de Avisos).
- **Estrutura atual:** DpPageHeader + grid `md:grid-cols-3` com 3 cards (Mensagens, Avisos, Modelos de Mensagem) e um bloco extra com `<h2>` "flex items-center gap-2".
- **Divergências:** 1) atual tem 3 cards vs 2 na doc — "Modelos de Mensagem" é extra (ver seção de telas extras); 2) breakpoint de grid diferente (`sm:grid-cols-2` doc vs `md:grid-cols-3` atual); 3) N/A; 4) N/A; 5) card extra "Modelos de Mensagem" não está na doc como hub, mas existe embutido dentro de adm_Mensagens.tsx (seção "Modelos Rápidos").
- **Ação sugerida:** Avaliar se "Modelos de Mensagem" deve ser card separado (como está hoje) ou volta a ser seção dentro de Mensagens, replicando a doc.
- **Toca no banco?** Não.

### Mensagens (/dp/mensagens)
- **Arquivo doc:** adm_Mensagens.tsx (519 linhas)
- **Arquivo atual:** DpMensagens.tsx (131 linhas) + DpModelosMensagem.tsx (164 linhas, separado)
- **Estrutura da doc:** h1, seção "Modelos Rápidos" embutida na mesma tela com Card, grid `md:grid-cols-2/3` de modelos, ações Aplicar/Editar/Excluir (ícones ghost), empty state `border-dashed rounded-xl`, Dialog de composição de mensagem com grid `md:grid-cols-2`, AlertDialog de exclusão de modelo.
- **Estrutura atual:** DpMensagens.tsx foca só no envio/listagem de mensagens (usa DpContentCard/DpEmptyState); a gestão de modelos foi extraída para tela própria DpModelosMensagem.tsx.
- **Divergências:** 1) diferença de hierarquia: doc mistura "Modelos Rápidos" + composição na mesma tela, atual separou em 2 telas; 2) estilo de empty state (`border-dashed rounded-xl`) presente em ambos conceitualmente; 3) fluxo mudou — no atual, aplicar um modelo exige navegar para outra tela, na doc é inline (seleciona modelo na hora de compor); 4) N/A; 5) nenhuma funcionalidade "faltando", apenas reorganizada.
- **Ação sugerida:** Avaliar reintroduzir seletor de "Modelo rápido" na tela de composição de Mensagens (atalho de aplicar direto), mantendo a tela de gestão de modelos separada para CRUD.
- **Toca no banco?** Não.

### Quadro de Avisos (/dp/avisos)
- **Arquivo doc:** adm_QuadroAvisos.tsx (454 linhas)
- **Arquivo atual:** DpAvisos.tsx (220 linhas)
- **Estrutura da doc:** h1, empty state `border-dashed rounded-2xl p-12`, badge de status ativo/inativo (`bg-green-100`/`bg-gray-100` rounded-full), ações Editar/Excluir com `title`, Dialog de cadastro com grid `grid-cols-2`.
- **Estrutura atual:** DpPageHeader, cards com CardTitle, grid `grid-cols-2` no dialog, empty state via `DpEmptyState` com ícone Megaphone.
- **Divergências:** 1) estrutura muito próxima; 2) confirmar se badge de status ativo/inativo usa as mesmas cores (verde/cinza) no componente `DpEmptyState`/badge atual; 3) fluxo equivalente; 4) N/A; 5) nenhuma faltando.
- **Ação sugerida:** Conferir paridade de cor do badge ativo/inativo.
- **Toca no banco?** Não.

### Modelos de Mensagem (/dp/modelos-mensagem)
- **Arquivo doc:** não existe como página própria — está embutido em adm_Mensagens.tsx (seção "Modelos Rápidos").
- **Arquivo atual:** DpModelosMensagem.tsx (164 linhas)
- **Estrutura atual:** tela própria de CRUD de modelos.
- **Divergências:** ver telas extras abaixo.
- **Ação sugerida:** ver seção "Telas extras".
- **Toca no banco?** Não.

### Importação em Massa de Documentos (/dp/documentos/importar)
- **Arquivo doc:** não encontrado em /tmp/dpdoc (sem correspondente).
- **Arquivo atual:** DpDocImportBulk.tsx (296 linhas)
- **Divergências:** tela inteiramente nova, sem referência na doc.
- **Ação sugerida:** ver seção "Telas extras".
- **Toca no banco?** Sim, provavelmente usa tabela própria de lotes/itens de importação — já implementada, sem correspondência a validar contra doc.

### Folha de Pagamento (Hub /dp/folha, Aprovações, Período)
- **Arquivo doc:** não encontrado (nenhum arquivo `adm_Folha*` em /tmp/dpdoc).
- **Arquivo atual:** DpFolhaHub.tsx (161), DpFolhaAprovacoes.tsx (151), DpFolhaPeriodo.tsx (173).
- **Divergências:** módulo inteiro sem correspondente na doc de referência.
- **Ação sugerida:** ver seção "Telas extras".
- **Toca no banco?** Sim, presumivelmente tabelas de folha/período já existentes no projeto atual, fora do escopo documentado.

---

## Colaborador (col_*) — visão resumida

### Login (col_Login.tsx, 198 linhas)
Não há página dedicada em `src/pages/dp/portal`; login provavelmente é tratado por fluxo de auth geral do projeto (fora do escopo de páginas "Dp*"). **Não encontrado** correspondente direto para comparar estrutura.

### Home Colaborador → DpMeuHome.tsx
- **Arquivo doc:** col_Home.tsx (119 linhas). Estrutura simples, sem Tabs/Card.
- **Arquivo atual:** DpMeuHome.tsx (não lido em detalhe nesta rodada — recomenda revisão futura).
- **Ação sugerida:** repetir a mesma checagem de estrutura para os `col_*` restantes (Perfil, Trocas, Documentos*, Historico, SetupAdmin) em uma rodada dedicada, pois o foco desta análise priorizou as telas administrativas (adm_*) conforme mapeamento fornecido.

### Calendário Colaborador → DpMeuCalendario.tsx
- **Arquivo doc:** col_Calendario.tsx (650 linhas) — mesmo padrão visual do adm_Calendario (h1 `text-4xl font-black`, Dialog de dia com badges).
- **Divergências:** aplicar a mesma recomendação do calendário admin (harmonizar peso visual do popup do dia).
- **Ação sugerida:** reutilizar o mesmo componente de popup de dia entre versão admin e colaborador (ver "Padrões visuais recorrentes").

### Trocas, Documentos, Disciplinar, Sindicato, Histórico, Perfil, SetupAdmin (colaborador)
Arquivos de doc existentes (col_Trocas 224 l., col_Documentos 358 l., col_DocumentosDisciplinar 124 l., col_DocumentosSindicato 444 l., col_DocumentosAtestados 489 l., col_Historico 87 l., col_Perfil 171 l., col_SetupAdmin 134 l.) têm correspondentes prováveis em DpMeuTrocas, DpMeuDocumentos, DpMeuDisciplinar, DpMeuSindicato, DpMeuAtestados, DpMeuHistorico, DpMeuPerfil. **Não foram abertos em detalhe nesta rodada** por priorização de tempo/escopo (o mapeamento fornecido focou em adm_*). Recomenda-se diagnóstico dedicado ao portal do colaborador como próxima etapa, usando o mesmo método (grep de Tabs/Dialog/Card/grid/dashed).

---

## Padrões visuais recorrentes na doc

1. **Botões primários "pill"**: `rounded-full px-6` em quase toda ação de "Novo/Criar" (Cargos, Colaboradores, Unidades, Bloqueios). Já replicado no atual — bom.
2. **Empty states com borda tracejada**: `border-dashed` + `rounded-xl`/`rounded-2xl`/`rounded-[2rem]` + texto centralizado em `text-muted-foreground`, usados em Mensagens, Avisos, Sindicatos, Negociações, Histórico de Documentos, Calendário. Recomenda-se consolidar em **um único componente `DpEmptyState`** (já existe, usado em algumas telas) e garantir que todas as telas o adotem, incluindo variação de raio (2xl/3xl) para telas de destaque como o Calendário.
3. **Badges de status coloridos por token semântico**: `bg-primary/10`, `bg-green-100/text-green-700`, `bg-blue-100/text-blue-800`, `bg-purple-100/text-purple-800`, `bg-available/20`/`bg-unavailable/20`. Vale padronizar em um componente `DpStatusBadge` com variantes fixas (ativo, inativo, aprovado, recusado, pendente, tipo de unidade) para evitar cores divergentes entre telas.
4. **Popup de detalhe do dia do calendário**: estilo único e mais "premium" (`rounded-[2.5rem] border-none shadow-2xl p-8`, título `text-3xl font-black`) usado tanto no calendário admin quanto no do colaborador. Deve virar um componente único `DpCalendarDayDialog` reaproveitado nas duas rotas (`DpFolgas` e `DpMeuCalendario`).
5. **Grids de vínculo com scroll** (`grid-cols-2 max-h-40 overflow-y-auto border rounded-lg p-3`) usados em Sindicatos, Unidades, Bloqueios para seleção múltipla (checkboxes de unidades/dias/meses). Bom candidato a componente `DpMultiSelectGrid`.
6. **Hubs com grid de NavigationCards** (Cadastro, Comunicação, Documentos, Folgas, Sindicatos): padrão consistente `grid sm:grid-cols-2 lg:grid-cols-3` de cards com ícone + título + descrição — já existe `NavigationCard.tsx`, garantir uso uniforme (breakpoints iguais em todos os hubs).

## Navegação (DpSidebar)

**Árvore sugerida pela doc** (com base nos hubs adm_*):
- Início
- Cadastro (hub) → Colaboradores, Cargos, Unidades, Sindicatos (hub → Cadastro, Negociações)
- Folgas (hub) → Calendário, Solicitações, Aprovações, Trocas, Bloqueios
- Documentos (hub) → Contracheque, Adiantamento, Ponto, Atestados, Disciplinar, ACT/CCT (Negociações), Histórico Completo
- Comunicação (hub) → Mensagens, Quadro de Avisos

**Árvore atual (DpSidebar.tsx):**
- Início
- Cadastro → Colaboradores, Cargos, Unidades, Sindicatos
- Folgas → Calendário Geral, Solicitações, Aprovações, Trocas, Datas Bloqueadas
- Documentos → Contracheque, Adiantamentos, Folhas de Ponto, Atestados, Registros Disciplinares, Negociações Coletivas (ACT/CCT), Histórico Completo, **Importar em massa**
- Comunicação → Central de Comunicação, Mensagens, Quadro de Avisos, **Modelos de Mensagem**
- (fora da sidebar visível no trecho lido: possíveis itens de Folha de Pagamento)

**Sugestão de ordem final:** manter a árvore atual (já é mais completa e organizada que a doc), apenas:
1. Confirmar se "Importar em massa" deve ficar em Documentos ou virar item separado de "Ferramentas/Admin".
2. Mover "Modelos de Mensagem" para dentro do fluxo de Mensagens (como submenu ou seletor inline) em vez de item de sidebar próprio, para reduzir 1 nível de navegação e alinhar com a doc.
3. Adicionar "Folha de Pagamento" (Hub/Aprovações/Período) como grupo próprio na sidebar, já que existem as páginas mas não foi possível confirmar entrada no menu no trecho revisado — checar se está registrado.

## Telas extras no projeto que não existem na doc

- **DpDocImportBulk.tsx** — importação em massa de documentos. Recomendação: **manter**, é funcionalidade operacional útil; sinalizar como "extra" na documentação interna do projeto.
- **DpFolhaHub.tsx / DpFolhaAprovacoes.tsx / DpFolhaPeriodo.tsx** — módulo de Folha de Pagamento inteiro. Recomendação: **manter**, mas identificar explicitamente como módulo fora do escopo do design de referência (não há padrão visual da doc para seguir aqui); revisar consistência visual com o restante do DP separadamente.
- **DpModelosMensagem.tsx** — na doc é uma seção dentro de Mensagens, não uma tela própria. Recomendação: **mover** o CRUD de modelos para dentro do fluxo de Mensagens (ou manter tela própria mas adicionar atalho de "aplicar modelo" direto na composição, replicando o fluxo da doc).
- **adm_SindicatosHub** (doc) sem correspondente exato no atual (DpSindicatos une cadastro direto). Caso oposto: doc tem tela que o atual não replica como hub — ok manter fluxo atual mais direto.

## Resumo executivo (Top 10 mudanças por prioridade)

1. **Padronizar o popup de "dia do calendário"** (admin e colaborador) num componente único `DpCalendarDayDialog`, com o visual mais "premium" da doc (`rounded-[2.5rem]`, `shadow-2xl`, tipografia black) — maior ganho de consistência visual.
2. **Revisar Bloqueios (/dp/bloqueios)**: doc sugere regras recorrentes (por dia da semana/mês/unidade) que parecem ausentes no atual — maior risco funcional, pode exigir mudança de banco.
3. **Padronizar badges de status** em componente único (`DpStatusBadge`) para eliminar inconsistência de cores entre telas (verde/cinza, azul/roxo, primary/10, available/unavailable).
4. **Unificar empty states** (dashed) em um único componente com variantes de raio, garantindo uso em 100% das telas de listagem vazia.
5. **Decidir sobre Tabs de status** em Solicitações/Aprovações/Atestados: doc não usa Tabs (lista única), atual introduziu segmentação — formalizar como melhoria intencional ou reverter.
6. **Reorganizar Modelos de Mensagem**: reintegrar seletor de "modelo rápido" na tela de composição de Mensagens, como na doc, mantendo CRUD dedicado.
7. **Adicionar destaque de "aniversariante com prioridade"** no Hub de Folgas, se ausente, replicando ícone/tooltip da doc.
8. **Padronizar breakpoints de grid** entre hubs (Cadastro, Comunicação, Documentos, Folgas) para consistência de responsividade (hoje variam entre `sm:`, `md:`, `lg:`).
9. **Envolver bloco de filtros do Histórico Completo em Card com título "Filtros"** e conferir 6º filtro presente na doc.
10. **Avaliar criação de `DpSindicatosHub`** simples (2 cards: Cadastro/Negociações) para replicar a camada de navegação da doc, ou documentar a simplificação atual como decisão de produto.
