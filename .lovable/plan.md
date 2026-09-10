# Rotina do Dia: agrupamento padrão por setor + menu recolhido centralizado

## 1. Agrupamento cargo/setor na Rotina do Dia

**Hoje:** a escolha já é lembrada nas preferências do usuário (`operacao_agrupamento` em `dp_user_prefs`), mas quando não há escolha salva o padrão é sempre **cargo**.

**Mudança:**
- Se a unidade tiver setores cadastrados (`usaSetores === true`), o padrão passa a ser **setor**; sem setores, continua **cargo**.
- Ao trocar para uma unidade sem setores, a preferência "setor" salva cai para "cargo" automaticamente (o botão Setor já só aparece quando há setores).
- A escolha manual do gestor continua sendo lembrada entre sessões.

Arquivo: `src/pages/dp/DpOperacaoPanorama.tsx` (linhas 846–851) — o valor efetivo vira `prefs ?? (usaSetores ? "setor" : "cargo")`, usando `panorama.usaSetores`.

## 2. Menu lateral recolhido: centralizar botões na faixa

**Problema (print):** recolhido, os ícones ficam deslocados — sobra espaço à esquerda e os botões pendem para a direita.

**Correção em `src/components/ui/sidebar.tsx` + sidebars:**
- No modo recolhido (`collapsible=icon`), zerar o padding lateral do container do menu/grupo e fazer cada item esticar na largura total da faixa, com o botão (32×32) centralizado por `justify-center` — hoje o botão recebe `!size-8 !p-2`, mas os paddings do `SidebarMenu`/`SidebarGroup`/`SidebarMenuItem` empurram o conjunto.
- Garantir o mesmo ajuste nos itens colapsados de `DpSidebar.tsx`, `AppSidebar.tsx` e `src/components/layout/sidebar-menus/shared.tsx` (cabeçalho, itens, rodapé/sair), mantendo tooltips e o visual já corrigido anteriormente.

## Verificação
- Typecheck + testes existentes.
- Navegador: recolher a barra e confirmar ícones centralizados na faixa escura; na Rotina do Dia, confirmar padrão por setor (unidade com setores) e que a troca cargo/setor é lembrada após recarregar.
