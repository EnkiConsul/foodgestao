# Adicionar botão de recolher no cabeçalho das barras laterais

## Objetivo

Inserir um botão de minimizar/recolher no **cabeçalho** de todas as barras laterais principais do sistema: App principal, Pessoas 360° e Backoffice Admin.

## Escopo

- Aplicar a mudança em `src/components/layout/AppSidebar.tsx`, `src/components/dp/DpSidebar.tsx` e `src/components/layout/AdminSidebar.tsx`.
- Manter os `SidebarTrigger` já existentes nos headers das páginas (não removê-los).
- Não alterar lógica de backend, permissões ou dados.

## Implementação

1. Criar um componente reutilizável `src/components/layout/SidebarToggleButton.tsx`.
   - Usar `useSidebar` e chamar `toggleSidebar()`.
   - Ícone dinâmico:
     - `ChevronsLeft` quando expandido (ação: recolher).
     - `ChevronsRight` quando recolhido (ação: expandir).
   - Botão `variant="ghost"` com `aria-label` e `title` apropriados.

2. Adicionar o botão dentro do `SidebarHeader` de cada barra lateral.
   - Posicionar à direita do logo, sem quebrar o layout centralizado existente.
   - Tornar o `SidebarHeader` `relative` e posicionar o botão de forma que permaneça visível no modo colapsado.
   - Ajustar padding/posicionamento no estado colapsado para evitar sobreposição com o logo.

3. Garantir que o botão funcione no mobile:
   - No mobile, a barra lateral é um `Sheet`; o botão continuará dentro do cabeçalho e visível quando o drawer estiver aberto.
   - O `toggleSidebar()` já trata o fechamento do drawer em telas pequenas.

## Validação

- Verificar em `/hub` e em rotas de cada módulo que o botão aparece no cabeçalho da barra lateral.
- Clicar no botão e confirmar que a barra lateral recolhe/expande corretamente.
- Testar no estado colapsado: o botão deve permanecer visível e a logo não deve ser truncada.
- No mobile, abrir o drawer e confirmar que o botão está presente e fecha o menu ao ser clicado.
- Confirmar que não há regressão no menu "Mais" ou no botão de hambúrguer do header.

## Detalhes técnicos

- Ícones: `ChevronsLeft` / `ChevronsRight` do `lucide-react`.
- Hook: `useSidebar` exportado de `@/components/ui/sidebar`.
- Arquivos alterados:
  - `src/components/layout/AppSidebar.tsx`
  - `src/components/dp/DpSidebar.tsx`
  - `src/components/layout/AdminSidebar.tsx`
- Arquivo novo:
  - `src/components/layout/SidebarToggleButton.tsx`
