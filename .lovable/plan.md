# Correção da sidebar recolhida

## Problema
Quando a barra lateral é recolhida, vários botões somem e os que aparecem ficam desalinhados. A imagem anexada mostra um item vazio (retângulo escuro) entre os ícones, indicando que alguns links perdem o ícone ou quebram de layout no modo colapsado.

## Diagnóstico
A sidebar usa o componente `Sidebar` do shadcn/ui com `collapsible="icon"`. O `SidebarMenuButton` já possui estilos para o estado recolhido (`group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2`), mas os itens customizados da aplicação não estão aproveitando esse comportamento de forma consistente:

- `AppSidebar`: item "Hub de Módulos" e os itens dos menus `FinanceiroMenu`, `PortalMenu` e `AccountMenu` usam `NavLink` com paddings próprios (`px-5`, `mx-2`, `py-2.5`) dentro de `SidebarMenuButton asChild`. No modo recolhido esses paddings conflitam com o tamanho forçado de 32x32, desalinhando ou escondendo o ícone.
- `DpSidebar`: `DpLink` não usa `SidebarMenuButton`, então perde o tratamento de recolhimento (`size-8`, tooltip). `DpGroup` no modo recolhido simplifica para um ícone, mas sem tooltip. O footer ("Organizar menu", "Telas em desenvolvimento", "Voltar ao Hub", nome do usuário, "Sair") some ou mantém texto que quebra o layout.
- Os componentes `SidebarNavItem` e `SidebarSection` em `src/components/layout/sidebar-menus/shared.tsx` não passam `tooltip` para o `SidebarMenuButton` e aplicam classes que conflitam com o estado recolhido.

## Objetivo
Fazer com que, no modo recolhido, todos os itens da sidebar apareçam como ícones quadrados de 32x32 alinhados centralmente, com tooltip no hover, e sem texto/labels quebrem o layout. Itens sem ícone devem continuar visíveis ou serem substituídos por um ícone padrão.

## Escopo
- Ajustar `src/components/layout/sidebar-menus/shared.tsx` (`SidebarNavItem`, `SidebarSection`).
- Ajustar `src/components/layout/AppSidebar.tsx`.
- Ajustar `src/components/dp/DpSidebar.tsx`.
- Não alterar estrutura de dados nem rotas.

## Passos

1. **Refatorar `SidebarNavItem`** para usar `SidebarMenuButton` com `tooltip={item.title}`, remover paddings/margens conflitantes do `NavLink` e deixar o estilo do shadcn controlar o recolhimento. Garantir que o ícone tenha `shrink-0` e que o badge/label suma no modo recolhido.

2. **Refatorar `DpLink`** para usar `SidebarMenuButton` com `tooltip={item.title}` e as classes padrão do shadcn, sem paddings customizados no link.

3. **Refatorar `DpGroup`** no modo recolhido para usar `SidebarMenuButton` com `tooltip={item.title}` e ícone centralizado, em vez de um `NavLink` solto.

4. **Revisar `AppSidebar`**: garantir que o item "Hub de Módulos" e os itens renderizados pelos menus laterais usem o padrão refatorado. Verificar se o footer (Suporte/Sair) também fica alinhado no modo recolhido — se necessário, esconder o texto e mostrar apenas ícone com tooltip.

5. **Ajustar `DpSidebar` footer**: no modo recolhido, esconder os textos de "Organizar menu", "Telas em desenvolvimento", "Voltar ao Hub" e dados do usuário, mantendo apenas ícones quando houver; o botão "Sair" deve ficar como ícone centralizado.

6. **Testar visualmente** no preview em `/dp/modelos-mensagem` (sidebar DP) e em uma rota do financeiro/portal (sidebar App), alternando entre expandido e recolhido, confirmando que todos os ícones aparecem alinhados e sem itens vazios.
