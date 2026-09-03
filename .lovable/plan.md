# Rebrand: 360°FOOD → Aveto 360

Troca completa de nome, logomarca, paleta e ajustes de layout, mantendo o domínio `aveto360.com`.

## O que você precisa enviar

Sem os arquivos da nova marca não dá para começar a parte visual. Enviar:

1. **Assinatura horizontal** (símbolo + nome), fundo transparente — SVG (ideal) ou PNG ~1600×400 px.
2. **Assinatura horizontal negativa** (versão para fundo escuro), mesmas medidas.
3. **Símbolo isolado** (só o ícone), quadrado, SVG ou PNG 1024×1024 — usado em sidebar recolhida, favicon, ícone do app instalável e avatar.
4. **Logo vertical/empilhada** (opcional), PNG transparente ~1200×1200 — login, PDFs e holerites.
5. **Cores oficiais em HEX** (primária, secundária, neutros) ou o manual de marca. Se não houver, extraio a paleta direto da logo e apresento antes de aplicar.

Formatos aceitos: SVG, PNG transparente, JPG (só para fotos). Se enviar só um arquivo grande da logo, eu gero as variações recortando/redimensionando.

## Etapas da implementação

### 1. Assets
- Subir as novas imagens como assets (`src/assets/aveto360-*`), substituindo os seis arquivos `360food-*` (assinatura, horizontal, ícone, símbolo, avatar, logo marinho).
- Regenerar favicon (`public/favicon.png`) e os ícones do `public/manifest.webmanifest` a partir do símbolo.
- Remover os assets antigos ao final.

### 2. Nome em todo o produto
Substituir "360°FOOD" / "Gestor 360°FOOD" por "Aveto 360" em:
- `index.html` (title, meta description, Open Graph, JSON-LD), `public/sitemap.xml`, `public/llms.txt`, `public/manifest.webmanifest`.
- Telas: Auth, PrimeiroAcesso, Hub, Buscar, onboarding, sidebars (App e DP), páginas legais e `legal-defaults`.
- Exportações e documentos: relatórios em PDF/CSV, holerite, contracheque.
- E-mails transacionais e funções de backend que citam o nome (auth-email-hook, convites, templates).
- Índice de busca interna e textos de ajuda.

### 3. Paleta e tokens
- Redefinir em `src/index.css` os tokens de marca: `--primary`, `--ring`, `--accent`, sidebar (`--sidebar-*`) e os tokens do site institucional (`--site-navy`, `--site-orange`, gradientes e sombras).
- Renomear os tokens `--site-orange`/`--site-navy` para nomes neutros da nova marca, ajustando `tailwind.config.ts` e os usos.
- Garantir contraste AA em tema claro e escuro; revisar estados de sucesso/alerta se a nova paleta conflitar.

### 4. Tipografia e layout
- Ajustar `fontFamily` em `tailwind.config.ts` e o `@import` de fontes conforme a identidade nova.
- Revisar landing page (hero, seções, rodapé), tela de login, Hub de módulos e cabeçalho das sidebars para acomodar a nova assinatura sem distorção.
- Conferir versões mobile e sidebar recolhida.

### 5. Verificação
- Typecheck e suíte de testes (há testes que citam o nome, ex. `InstallPrompt.test.tsx`).
- Conferência visual no preview: login, hub, financeiro, DP, portal do colaborador e landing.

## Observações

- Domínio e links canônicos permanecem em `aveto360.com`; `src/lib/siteOrigin.ts` hoje aponta para `https://www.gestor360food.com` e será atualizado para `https://www.aveto360.com`.
- Nenhuma mudança de banco, RLS ou regra de negócio.
