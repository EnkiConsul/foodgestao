

## Melhorar Visualizacao e Contraste da Logomarca

### Problema
A logomarca esta muito pequena (h-9 = 36px) e sem destaque no sidebar escuro. O fundo azul escuro do sidebar engole a imagem, tornando-a quase invisivel.

### Solucao

**1. Aumentar o tamanho da logomarca**
- Mudar de `h-9` para `h-12` (48px) para melhor visibilidade

**2. Adicionar fundo de contraste**
- Envolver a imagem em um container com fundo claro arredondado (`bg-white/10 rounded-xl p-2`) para criar separacao visual do fundo escuro

**3. Melhorar o espacamento do header do sidebar**
- Adicionar padding inferior e uma borda sutil para separar o logo do menu

### Detalhes Tecnicos

**Arquivo:** `src/components/layout/AppSidebar.tsx`

Alteracoes no `SidebarHeader` (linhas 54-58):
- Container do logo: adicionar `bg-white/10 rounded-xl p-2.5` para criar fundo translucido claro
- Imagem: aumentar para `h-12 w-auto` e adicionar `brightness-110` para realcar
- Header: adicionar `border-b border-sidebar-border mb-2` para separar do menu

Nenhuma dependencia nova necessaria.

