

## Corrigir Visibilidade da Logomarca no Sidebar

### Diagnostico

A logomarca nao aparece no sidebar porque o PNG transparente tem elementos em cores escuras (azul marinho) sobre o fundo escuro do sidebar (`#1B3A5C`). O resultado e texto escuro sobre fundo escuro -- completamente invisivel. O problema nunca foi de tamanho, e sim de **contraste de cor**.

### Duas opcoes de solucao

**Opcao A (Recomendada): Filtro CSS para inverter/clarear a logo**
- Aplicar `brightness(0) invert(1)` na imagem para tornar todos os pixels brancos
- Resultado: logo branca sobre fundo escuro, sem necessidade de container branco
- Simples, elegante e integrado ao sidebar

**Opcao B: Container branco compacto**
- Voltar ao container branco (`bg-white rounded-xl p-2`) que funcionava antes
- Logo fica legivel dentro de um "cartao" branco
- Menos integrado visualmente, mas garante que as cores originais da marca aparecam

### Detalhes Tecnicos

**Arquivo:** `src/components/layout/AppSidebar.tsx`

**Opcao A (filtro CSS):**
```tsx
<SidebarHeader className="p-5 border-b border-sidebar-border mb-2">
  <div className="flex items-center justify-center">
    <img 
      src={logoGestorPlin} 
      alt="Gestor Plin" 
      className="h-14 w-auto brightness-0 invert drop-shadow-[0_2px_4px_rgba(255,255,255,0.15)]" 
    />
  </div>
</SidebarHeader>
```

**Opcao B (container branco):**
```tsx
<SidebarHeader className="p-5 border-b border-sidebar-border mb-2">
  <div className="flex items-center justify-center">
    <div className="bg-white rounded-xl p-2.5 shadow-lg shadow-black/20">
      <img src={logoGestorPlin} alt="Gestor Plin" className="h-14 w-auto" />
    </div>
  </div>
</SidebarHeader>
```

Nenhuma dependencia nova necessaria.
