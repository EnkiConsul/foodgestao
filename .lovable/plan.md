

## Corrigir Exibicao da Logomarca no Sidebar

### Problema
As classes CSS `brightness-0 invert opacity-90` aplicadas na imagem estao convertendo toda a logo para branco puro, resultando em um retangulo branco sem detalhes visiveis.

### Solucao
Remover os filtros `brightness-0 invert opacity-90` da tag `<img>` no arquivo `src/components/layout/AppSidebar.tsx` e aplicar um container com fundo branco semi-transparente (`bg-white/90 rounded-xl p-2.5`) para que as cores originais da marca fiquem visiveis sobre o fundo escuro do sidebar.

### Detalhe Tecnico

**Arquivo:** `src/components/layout/AppSidebar.tsx`

De:
```html
<img src={logoGestorPlin} alt="Gestor Plin" className="h-16 w-auto brightness-0 invert opacity-90" />
```

Para:
```html
<div className="bg-white/90 rounded-xl p-2.5">
  <img src={logoGestorPlin} alt="Gestor Plin" className="h-12 w-auto" />
</div>
```

Isso mantera as cores originais da logomarca visiveis e com boa legibilidade sobre o fundo escuro do sidebar.
