

## Implementar Nova Logomarca e Paleta de Cores

### 1. Logomarca

- Copiar `Logo_Gestor_Plin_Lovable-3.png` para `public/images/logo-gestor-plin-transparent.png` (substituindo a atual)
- No sidebar (`AppSidebar.tsx`): remover os filtros `brightness-0 invert` e usar um **container branco arredondado** (`bg-white/95 rounded-xl p-3`) para que as cores originais da marca fiquem visiveis sobre o fundo escuro
- Na pagina de login (`Auth.tsx`): exibir a logo diretamente sem container (fundo claro ja garante contraste)

### 2. Paleta de Cores Baseada na Logo

Cores extraidas da logomarca:
- **Azul Marinho** `#1B3A5C` (hsl 211 52% 23%) -- textos, sidebar, foreground
- **Azul Medio** `#2D6EB5` (hsl 211 60% 44%) -- cor primaria (botoes, links, acoes)
- **Azul Claro** `#5BA4D9` (hsl 205 62% 60%) -- destaques, sidebar primary, hover

Atualizacoes no `src/index.css`:

**Modo Claro:**
- `--background`: cinza azulado muito claro (210 25% 97%)
- `--foreground`: azul marinho (211 52% 18%)
- `--primary`: azul medio (211 60% 44%)
- `--card`: branco puro
- `--sidebar-background`: azul marinho escuro (211 52% 18%)
- `--sidebar-primary`: azul claro (205 62% 60%)
- `--success`: verde azulado (160 45% 40%) -- receitas
- `--destructive`: vermelho neutro (0 65% 51%) -- despesas
- `--warning`: amarelo quente (38 82% 52%)

**Modo Escuro:**
- `--background`: azul muito escuro (211 50% 6%)
- `--primary`: azul claro (205 62% 55%)
- `--sidebar-background`: quase preto azulado (211 50% 5%)

### 3. Detalhes Tecnicos

**Arquivos modificados:**
- `public/images/logo-gestor-plin-transparent.png` -- substituicao pela nova logo
- `src/components/layout/AppSidebar.tsx` -- container branco para a logo, remocao dos filtros CSS
- `src/index.css` -- tokens de cor atualizados (light + dark mode)
- `src/pages/Auth.tsx` -- verificar se a logo esta sendo usada corretamente

**Nenhuma dependencia nova.**

