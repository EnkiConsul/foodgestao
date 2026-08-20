# Ocultar telas em desenvolvimento (chave do super admin)

Um painel exclusivo do super admin para marcar quais telas do Pessoas 360° e do Portal do Colaborador estão "em desenvolvimento", e um único botão liga/desliga que aplica tudo de uma vez para todos os usuários.

## Como vai funcionar

1. Nova tela no painel administrativo: **Telas em desenvolvimento** (`/admin/telas`).
2. No topo, um interruptor único: **Ocultar telas em desenvolvimento** (ligado/desligado). Ele vale para todos os usuários, inclusive você.
   - Ligado: todas as telas marcadas ficam invisíveis.
   - Desligado: tudo volta a aparecer, sem perder as marcações.
3. Abaixo, a lista completa do menu do DP e do Portal, agrupada exatamente como no menu, com uma caixa de marcação por tela.
   - Marcar/desmarcar o grupo inteiro em um clique.
   - Quando **todas** as telas de um grupo estão marcadas, o grupo desaparece do menu automaticamente (nada extra a configurar).
   - Contadores por grupo ("3 de 5 ocultas") para leitura rápida.
4. Efeito no sistema, com o interruptor ligado:
   - Item oculto não aparece na sidebar do DP/Portal nem no menu "Mais" mobile nem nos atalhos da BottomNav.
   - Grupo com todos os itens ocultos não aparece.
   - Se alguém abrir a URL direto, a rota mostra uma página **"Tela em desenvolvimento"** (aviso amigável com botão para voltar), em vez do conteúdo.
   - Telas já marcadas com o selo "Em breve" no menu continuam funcionando como hoje; a ocultação é independente do selo.

## Detalhes técnicos

**Banco de dados**
- Nova tabela `app_hidden_screens` (config global, não por empresa):
  - `id` fixo único (`singleton boolean primary key default true` + check), `enabled boolean not null default true`, `routes text[] not null default '{}'`, `updated_by uuid`, `updated_at timestamptz`.
  - GRANTs: `SELECT` para `anon` e `authenticated` (todo app precisa ler a config), `ALL` para `service_role`.
  - RLS: leitura liberada; `INSERT/UPDATE` apenas quando `public.has_role(auth.uid(), 'super_admin')`.
- Semente inicial: uma linha com `enabled = true` e `routes = '{}'`.

**Frontend**
- `src/hooks/useHiddenScreens.tsx`: leitura da config via React Query (cache longo + `staleTime`), expõe `enabled`, `routes: Set<string>`, `isHidden(to)`, além das mutations `toggleEnabled` e `setRoutes` (só super admin).
- `src/lib/nav/hiddenScreens.ts`: helpers puros — `filterSurface(surface, hidden)` devolve a superfície de navegação sem itens ocultos e sem grupos vazios; `isRouteHidden(path, hidden)` casa rota exata e prefixos de rotas filhas (ex.: `/dp/folha/:id` fica oculto junto de `/dp/folha`). Cobertos por teste unitário.
- Consumidores da navegação passam a filtrar pela superfície já tratada: `src/components/dp/DpSidebar.tsx`, `src/config/mobileNav.tsx` (menu "Mais" e atalhos), `src/hooks/useDpMenuLayout.tsx` (sanitização do layout salvo ignora ocultos sem apagar a preferência do usuário).
- `src/components/nav/EmDesenvolvimento.tsx`: página de aviso.
- `src/components/nav/HiddenScreenGuard.tsx`: wrapper aplicado às rotas do DP/Portal em `src/App.tsx`; se a rota atual está oculta e o interruptor está ligado, renderiza o aviso.
- `src/pages/admin/AdminTelasDesenvolvimento.tsx` + item no `AdminSidebar`, protegido por `SuperAdminRoute`. A lista é derivada de `DP_ADMIN_NAV` e `DP_PORTAL_NAV` (fonte única já existente), então telas novas aparecem sozinhas no painel.
- Salvamento com feedback via `toast` e invalidação da query para refletir na hora.

**Fora de escopo por agora:** Financeiro, Pedidos e cartões de módulo do Hub — a estrutura fica pronta para estender depois, bastando registrar as superfícies desses módulos no mesmo helper.
