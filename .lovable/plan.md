

## Corrigir Legibilidade da Logomarca no Sidebar

### Diagnostico
A logomarca aparece muito pequena e ilegivel porque:
1. A altura da imagem esta limitada a `h-12` (48px), insuficiente para o nivel de detalhe da logo
2. O padding do container (`p-2.5`) reduz ainda mais o espaco util da imagem

### Solucao
Aumentar a altura da imagem e ajustar o container para dar mais espaco a logo.

### Detalhe Tecnico

**Arquivo:** `src/components/layout/AppSidebar.tsx`

Alterar a linha 56-58 de:
```html
<div className="bg-white/90 rounded-xl p-2.5">
  <img src={logoGestorPlin} alt="Gestor Plin" className="h-12 w-auto" />
</div>
```

Para:
```html
<div className="bg-white/95 rounded-xl px-4 py-3">
  <img src={logoGestorPlin} alt="Gestor Plin" className="h-14 w-auto" />
</div>
```

Mudancas:
- **h-12 para h-14** (48px para 56px): aumenta a logo para melhor legibilidade
- **p-2.5 para px-4 py-3**: mais espaco horizontal para a logo "respirar"
- **bg-white/90 para bg-white/95**: fundo mais opaco para maior contraste

Se a imagem PNG em si tiver muito espaco vazio ao redor (margem transparente), pode ser necessario substituir o arquivo por uma versao recortada (cropada) para aproveitar melhor o espaco disponivel.

