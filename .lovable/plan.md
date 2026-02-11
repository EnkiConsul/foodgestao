

## Corrigir Logomarca no Sidebar

### Problema
A logomarca esta praticamente invisivel no sidebar. O PNG tem fundo branco embutido que cria um retangulo branco pequeno contra o fundo azul escuro. Com apenas 48px de altura, fica ilegivel.

### Solucao

**1. Aumentar significativamente o tamanho da logo**
- Mudar de `h-12` (48px) para `h-16` (64px) para melhor legibilidade

**2. Adicionar fundo branco arredondado para integrar o PNG**
- Como o PNG ja tem fundo branco, aplicar um fundo branco solido com bordas arredondadas na propria imagem usando `bg-white rounded-xl p-2`
- Isso integra o fundo branco do PNG com o container, eliminando bordas irregulares

**3. Aumentar o padding do header**
- Dar mais espaco ao redor da logo para respirar

### Detalhes Tecnicos

**Arquivo:** `src/components/layout/AppSidebar.tsx`

Alteracao na linha 54-57:
```
// De:
<SidebarHeader className="p-5 border-b border-sidebar-border mb-2">
  <div className="flex items-center justify-center">
    <img src={logoGestorPlin} alt="Gestor Plin" className="h-12 w-auto rounded-lg shadow-lg shadow-black/20" />
  </div>
</SidebarHeader>

// Para:
<SidebarHeader className="p-5 border-b border-sidebar-border mb-2">
  <div className="flex items-center justify-center">
    <div className="bg-white rounded-xl p-2 shadow-lg shadow-black/20">
      <img src={logoGestorPlin} alt="Gestor Plin" className="h-16 w-auto" />
    </div>
  </div>
</SidebarHeader>
```

O container branco com bordas arredondadas vai:
- Absorver o fundo branco do PNG de forma natural
- Criar um "cartao" limpo e integrado
- A sombra sutil da profundidade contra o fundo escuro
- O tamanho maior (64px) torna a logo legivel

Nenhuma dependencia nova necessaria.
