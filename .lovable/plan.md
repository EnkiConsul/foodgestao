## Objetivo

Replicar fielmente a estrutura do projeto referência (Pakerê Portal do Colaborador) nos módulos **DP 360°** e **Portal do Colaborador**, mantendo as cores da marca 360°FOOD (laranja `#EB6119`, marinho `#0F1B3D`). O módulo Financeiro permanece como está.

## O que muda

### 1. Shell dedicado para DP/Portal (`DpShell`)

Novo layout específico para rotas `/dp/*`, independente do `AppLayout` do Financeiro:

- **Sidebar branca fina** (~240px), sem gradiente, borda direita sutil.
  - Topo: logo 360°FOOD + subtítulo ("DP 360°" ou "Portal do Colaborador").
  - Itens de menu com ícone à esquerda, texto médio; item ativo em **pílula laranja sólida** (`bg-primary`) com texto branco e cantos arredondados (`rounded-lg`).
  - Itens expansíveis (Cadastro, Comunicação) com chevron à direita e submenu recuado.
  - Rodapé fixo: nome do usuário em CAPS, cargo/e-mail abaixo, link **Sair** em laranja.
  - **Sem grupo "Conta"**, **sem link "Hub"** na barra lateral. Um botão discreto "← Voltar ao Hub" acima do rodapé.
- **Header** simples: só o `SidebarTrigger`, o `ContextSelector` (quando aplicável) e o sino de notificações. Sem toggle de privacidade.
- **Main** com fundo creme muito sutil (`bg-[hsl(var(--dp-canvas))]`), padding generoso.

### 2. Menu isolado do módulo

Ao entrar em `/dp` a sidebar mostra **apenas** o menu do DP:
- Início
- Cadastro (Colaboradores, Unidades, Cargos, Sindicatos, Negociações)
- Operação (Folgas, Trocas, Solicitações, Aprovações)
- Compliance (Disciplinar, Bloqueios, Documentos)
- Folha (Períodos, Aprovações Financeiro)
- Comunicação (Avisos, Mensagens)

Em `/dp/meu` (Portal do Colaborador):
- Início
- Cadastro (Meus dados)
- Folgas / Trocas
- Documentos
- Comunicação (Avisos, Mensagens)

Nada de Financeiro/Empresas/Usuários/Planos aparece nessas rotas.

### 3. Nova Home `/dp` — "Painel Administrativo"

Reformular `DpHome.tsx` para espelhar a referência:

- **Cabeçalho**: sino + "Painel Administrativo" + subtítulo "Visão geral e atalhos rápidos".
- **Grid 2 colunas** (desktop):
  - **Pendências do Sistema** (badge com contador) — lista rolável de cards internos com ícone à esquerda, título, subtítulo (empresa/período), tag "Atrasado Xd" vermelha, botões **Resolver** / **Adiar**. Fonte: agregação de solicitações pendentes + folhas não fechadas + negociações sindicais vencidas + documentos em atraso (query no client, sem migration).
  - **Aniversariantes dos Próximos 30 Dias** (badge com contador) — cards com dia/mês em círculo pastel, nome, tag "Contratação" ou "Nascimento", tempo de casa/idade, botão **Mensagem** (link p/ `/dp/mensagens?to=<id>`).
- **Atalhos Favoritos** (grid de 5 tiles arredondados, borda tracejada suave): Colaboradores, Folha, Solicitações, Documentos, Avisos. Clique navega; ordem fixa por enquanto (o "pressione para reordenar" fica como TODO textual).

Home `/dp/meu` recebe o mesmo tratamento visual (Pendências = minhas solicitações abertas; Aniversariantes = da equipe; Atalhos = Documentos, Solicitações, Trocas, Avisos, Meus Dados).

### 4. Tokens visuais (sem quebrar o resto)

Adicionar em `src/index.css` (escopo só para `.dp-shell`):
- `--dp-canvas` — fundo creme muito claro
- `--dp-card` — branco puro com borda âmbar suave
- `--dp-pending` — vermelho pastel para tags "Atrasado"
- `--dp-birthday-nasc` / `--dp-birthday-contrat` — pastéis rosa/azul

Cores da marca (laranja/marinho) continuam sendo `--primary` e `--sidebar-primary` — nada é reescrito globalmente.

## Arquivos afetados

**Novos**
- `src/components/dp/DpShell.tsx` — layout completo (SidebarProvider + DpSidebar + DpHeader + Outlet)
- `src/components/dp/DpSidebar.tsx` — sidebar branca fina, item ativo em pílula, rodapé com usuário/Sair
- `src/components/dp/DpHeader.tsx` — header enxuto
- `src/components/dp/home/PendenciasCard.tsx`
- `src/components/dp/home/AniversariantesCard.tsx`
- `src/components/dp/home/AtalhosFavoritos.tsx`
- `src/hooks/useDpPendencias.tsx` — agrega pendências do módulo
- `src/hooks/useDpAniversariantes30d.tsx` — próximos 30 dias (nascimento + contratação)

**Modificados**
- `src/App.tsx` — rotas `/dp/*` e `/dp/meu/*` passam a usar `DpShell` em vez de `AppLayout + DpLayout`
- `src/components/dp/DpLayout.tsx` — reduzido a guard de contexto PJ (retorna `<Outlet />`)
- `src/components/dp/ColaboradorShell.tsx` — passa a envolver com `DpShell` no modo portal
- `src/pages/dp/DpHome.tsx` — reescrito no padrão "Painel Administrativo"
- `src/pages/dp/portal/DpMeuHome.tsx` — mesmo padrão em versão colaborador
- `src/index.css` — novos tokens `--dp-*`
- `src/hooks/useActiveModule.tsx` — não precisa mudar (DP continua isolado)
- **Não** alterar `AppSidebar.tsx` / `AppLayout.tsx` / rotas do Financeiro
- **Remover** os menus do DP/Portal de `sidebar-menus/DpMenu.tsx` e `PortalMenu.tsx` (deixam de ser usados) — arquivos deletados

## Validação
- `tsgo --noEmit`
- Screenshot Playwright em `/dp` e `/dp/meu` comparando com a referência (sidebar, pílula ativa, painel).
- Verificar que `/dashboard` (Financeiro) segue idêntico.

## Fora de escopo
- Reordenação drag-and-drop de "Atalhos Favoritos" (só marcação textual)
- Persistência de favoritos por usuário
- Alterações em CRM/RH/Pedidos/Backoffice
