# Menus com telas em cards, início mais limpo e ordem padrão

## 1. Cada menu abre uma tela com os cards das suas telas

Hoje só Cadastro, Documentos e Comunicação têm uma tela de entrada com cards. Rotina abre direto a Operação e Geral abre direto o Analytics.

- Criar a tela de entrada de **Rotina** (`/dp/rotina`) com cards: Operação, Ocorrências, Convocações, Folgas, Férias e Atestados.
- Criar a tela de entrada de **Geral** (`/dp/geral`) com cards: Analytics, Configurações e Auditoria de erros.
- O clique no nome do menu (Rotina, Geral) passa a abrir essas telas de entrada.
- Padronizar as telas de entrada de Cadastro, Documentos e Comunicação para listarem exatamente as mesmas telas do menu, no mesmo formato de card.

## 2. Painel administrativo no celular

- No celular, os primeiros itens do Início passam a ser os cards dos menus principais (Cadastro, Documentos, Comunicação, Rotina, Geral), para navegar em um toque.
- No computador o Início continua como está hoje.

## 3. Limpeza dos cards do topo do Início

- Remover o card "Pendências abertas" (a lista completa já aparece logo abaixo).
- Remover o card "Férias vencendo" (essas férias já aparecem nas pendências da mesma tela).
- Corrigir o card **Ajustes**: hoje ele abre o Cadastro; passa a abrir Configurações de Pessoas.
- Permanece o card "Ocorrências hoje".

## 4. Aniversariantes

- Título passa a ser apenas **Aniversariantes**.
- Logo abaixo: "Aniversários de nascimento e de contratação nos próximos 30 dias".

## 5. Atestados muda de menu

- Atestados sai de Documentos e passa para **Rotina** (o endereço `/dp/atestados` continua o mesmo, então links salvos seguem funcionando).

## 6. Ordem dos menus da Pakerê como padrão do sistema

Ordem de fábrica passa a ser: **Início, Cadastro, Documentos, Comunicação, Rotina, Geral**, com esta ordem interna:

- Cadastro: Colaboradores, Cargos e Salários, Unidades, Benefícios, Pendências
- Documentos: Importar, Histórico, Disciplinares
- Comunicação: Mensagens, Modelos de Mensagem, Quadro de Avisos, Notificações
- Rotina: Operação, Ocorrências, Convocações, Folgas, Férias, Atestados
- Geral: Analytics, Configurações, Auditoria de erros

Quem já reorganizou o próprio menu continua com a ordem escolhida; a personalização por usuário/empresa segue funcionando.

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: reordenar `ADMIN_GROUPS`, mover o item Atestados para o grupo `rotina` (incluir `/dp/atestados` em `matchPrefixes`), ajustar `hubTo` de `rotina` para `/dp/rotina` e de `geral` para `/dp/geral`.
- Novas páginas `src/pages/dp/DpRotinaHub.tsx` e `src/pages/dp/DpGeralHub.tsx` usando `DpPage`/`DpPageHeader` + `NavigationCard`; rotas lazy em `src/App.tsx` dentro do `DpShell` admin.
- Grades de cards derivadas de `DP_ADMIN_NAV` (grupo por id) para não duplicar listas; hubs existentes (`DpCadastrosHub`, `DpComunicacaoHub`) alinhados à mesma fonte, mantendo cards extras já existentes (Regras de Folgas, Configurações, Aniversariantes).
- `src/components/dp/home/KpiCards.tsx`: remover cards de pendências/férias e hooks que só os alimentavam (`useDpFerias`, `useStablePendencias`, decisões/prefs); `Ajustes` → `/dp/configuracoes`.
- `src/pages/dp/DpHome.tsx`: bloco de cards dos menus renderizado só no mobile (`useIsMobile`) acima dos KPIs.
- `AniversariantesCard.tsx`: novo título e subtítulo (variante admin; portal mantém texto próprio).
- Verificar `src/config/mobileNav.parity.test.ts` e os testes de menu após a mudança de grupo do Atestados. Sem alterações de banco.
