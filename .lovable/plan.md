

## Corrigir Visualizacao da Logomarca no Sidebar

### Problema
A logomarca tem fundo branco embutido no PNG, e o container translucido (`bg-white/10`) cria um retangulo claro visivel que destoa do sidebar escuro. O resultado e um "quadrado branco" sobre fundo azul escuro - feio e sem integracao visual.

### Solucao

**1. Remover o container de fundo translucido**
- Retirar `bg-white/10 rounded-xl p-2.5` do container da logo
- A imagem ja tem seu proprio fundo, nao precisa de outro

**2. Aplicar bordas arredondadas e sombra na propria imagem**
- Adicionar `rounded-lg` na imagem para suavizar os cantos do fundo branco do PNG
- Adicionar uma sombra sutil (`shadow-lg shadow-black/20`) para integrar melhor ao fundo escuro

**3. Aumentar a imagem para preencher melhor o espaco**
- Manter `h-12` mas centralizar a imagem no header

### Detalhes Tecnicos

**Arquivo:** `src/components/layout/AppSidebar.tsx`

Alteracoes nas linhas 54-57:
```
// De:
<div className="flex items-center gap-2.5 bg-white/10 rounded-xl p-2.5">
  <img src={logoGestorPlin} alt="Gestor Plin" className="h-12 w-auto brightness-110" />
</div>

// Para:
<div className="flex items-center justify-center">
  <img src={logoGestorPlin} alt="Gestor Plin" className="h-12 w-auto rounded-lg shadow-lg shadow-black/20" />
</div>
```

Nenhuma dependencia nova necessaria.

