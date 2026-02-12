

## Implementar Logomarca do Gestor Plin em Toda a Aplicacao

### Visao Geral
Copiar a imagem enviada para o projeto e criar um componente reutilizavel `Logo.tsx`, aplicando-o em todos os pontos da aplicacao: sidebar, header, login/cadastro, loading/splash screen e favicon.

---

### 1. Copiar a imagem para o projeto

- Copiar `user-uploads://logo-gestor-plin.png.png` para `public/logo-gestor-plin.png`
- Este caminho sera usado no favicon e no componente Logo

### 2. Criar componente reutilizavel `src/components/Logo.tsx`

Props:
- `size`: `'sm' | 'md' | 'lg'` (32px, 40px, 56px)
- `className`: string opcional
- `linkTo`: string opcional (default: `'/'`)

O componente renderiza um `<Link>` do react-router-dom envolvendo a `<img>`. Se `linkTo` for `null`, renderiza apenas a imagem sem link.

```text
+---------------------------+
| Logo.tsx                  |
| size='sm' -> h-8  (32px) |
| size='md' -> h-10 (40px) |
| size='lg' -> h-14 (56px) |
| linkTo -> Link wrapper    |
+---------------------------+
```

### 3. Atualizar o Sidebar (`AppSidebar.tsx`)

- Substituir a tag `<img>` atual pelo componente `<Logo>`
- **Expandido**: `size="md"` (36px ~ h-9) dentro do container branco existente
- **Colapsado**: versao compacta usando `object-fit: cover` e `object-position` para mostrar apenas o icone da arvore, com tamanho fixo de 32x32px
- Manter o container `bg-white/95 rounded-xl` para contraste
- Usar o contexto do sidebar (`useSidebar`) para detectar estado expandido/colapsado

### 4. Atualizar o Header (`AppHeader.tsx`)

- Adicionar `<Logo>` a esquerda, antes do `SidebarTrigger`
- Desktop: `size="md"` (40px)
- Mobile: `size="sm"` (32px)
- Clique redireciona para `/` (Dashboard)

### 5. Atualizar a pagina de Login/Cadastro (`Auth.tsx`)

- Substituir a `<img>` atual pelo componente `<Logo size="lg" linkTo={null} />`
- Altura de 56px, centralizada
- Manter margem inferior de 32px (`mb-8`) entre a logo e o formulario

### 6. Atualizar o Loading/Splash Screen (`App.tsx`)

- No `ProtectedRoute`, substituir o spinner atual por uma tela com:
  - Logo centralizada com altura de 64px (classe customizada `h-16`)
  - Animacao de fade-in usando classe Tailwind `animate-fade-in` (ou keyframe customizado no `index.css`)
  - Spinner abaixo da logo

### 7. Atualizar o Favicon (`index.html`)

- Adicionar `<link rel="icon" href="/logo-gestor-plin.png" type="image/png">` no `<head>`

---

### Detalhes Tecnicos

**Arquivos criados:**
- `src/components/Logo.tsx`

**Arquivos modificados:**
- `public/logo-gestor-plin.png` (copia do upload)
- `index.html` (favicon)
- `src/components/layout/AppSidebar.tsx` (usar Logo com suporte a colapsado/expandido)
- `src/components/layout/AppHeader.tsx` (adicionar Logo a esquerda)
- `src/pages/Auth.tsx` (substituir img por Logo)
- `src/App.tsx` (splash screen com Logo + fade-in)
- `src/index.css` (keyframe `fade-in` se necessario)

**Dependencias:** nenhuma nova -- usa apenas react-router-dom (ja instalado) e Tailwind.
