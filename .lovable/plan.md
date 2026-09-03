# Rebrand: 360°FOOD → Aveto 360

Troca completa de nome, logomarca, paleta e ajustes de layout, mantendo o domínio `aveto360.com`.

## Marca recebida

- Logo completa (símbolo + "AVETO 360") em fundo branco — PNG 1254×1254.
- Símbolo com "360" em fundo preto — JPEG 1254×1254.

Cores extraídas da arte:

| Uso | HEX |
| --- | --- |
| Verde principal | `#02AB3D` |
| Verde escuro (profundidade/hover) | `#0E5C2C` |
| Preto da tipografia / fundo escuro | `#000000` → superfícies `#0B0F0D` |
| Cinza claro (faceta do símbolo) | `#F0F0F0` |

O que ainda ajuda (opcional, não bloqueia): versões em **SVG** e uma **assinatura horizontal** (símbolo à esquerda + nome à direita), porque as duas artes recebidas são quadradas — para a sidebar expandida e o topo do site o formato horizontal fica melhor.

## Etapas da implementação

### 1. Assets
- Subir as duas artes como assets CDN: `aveto360-logo.png` (fundo branco/claro) e `aveto360-symbol.png` (fundo escuro).
- Gerar a partir delas as variações que o app usa hoje:
  - símbolo recortado com fundo transparente (sidebar recolhida, avatar);
  - assinatura horizontal montada a partir do símbolo + nome (cabeçalho da sidebar e site) — versão clara e negativa.
- Regenerar `public/favicon.png` e os ícones do `public/manifest.webmanifest` a partir do símbolo.
- Remover os seis assets `360food-*` ao final.

### 2. Nome em todo o produto
Substituir "360°FOOD" / "Gestor 360°FOOD" por "Aveto 360" em:
- `index.html` (title, meta description, Open Graph, JSON-LD), `public/sitemap.xml`, `public/llms.txt`, `public/manifest.webmanifest`.
- Telas: Auth, PrimeiroAcesso, Hub, Buscar, onboarding, sidebars (App e DP), páginas legais e `legal-defaults`.
- Exportações e documentos: relatórios PDF/CSV, holerite, contracheque.
- E-mails transacionais e funções de backend que citam o nome (auth-email-hook, convites, templates).
- Índice de busca interna e textos de ajuda.

### 3. Paleta e tokens
- `src/index.css`: `--primary` passa a ser o verde `#02AB3D` (com `--primary-foreground` branco), `--ring` e `--accent` derivados do verde; sidebar (`--sidebar-*`) migra do marinho para o preto/verde-escuro da marca.
- Tokens do site institucional: `--site-navy` → superfície escura preta/grafite, `--site-orange` → verde da marca; renomear para nomes neutros (`--site-ink-deep`, `--site-brand`) ajustando `tailwind.config.ts` e os usos.
- Recalibrar sucesso/alerta/erro para não colidirem com o verde da marca (sucesso ganha um verde mais escuro ou vira azul-petróleo, a definir no ajuste de contraste).
- Garantir contraste AA em tema claro e escuro.

### 4. Tipografia e layout
- A logo usa tipografia geométrica de traço técnico; adotar **Urbanist/Epilogue** (já configurados) reforçando `font-display` nos títulos, com opção de trocar por uma geométrica mais próxima se preferir.
- Revisar landing page (hero, seções, rodapé), tela de login, Hub de módulos e cabeçalhos das sidebars para acomodar a nova assinatura sem distorção — inclusive mobile e sidebar recolhida.

### 5. Verificação
- Typecheck e suíte de testes (há testes que citam o nome, ex. `InstallPrompt.test.tsx`).
- Conferência visual no preview: login, hub, financeiro, DP, portal do colaborador e landing.

## Observações

- Domínio e links canônicos ficam em `aveto360.com`; `src/lib/siteOrigin.ts` hoje aponta para `https://www.gestor360food.com` e será atualizado.
- Nenhuma mudança de banco, RLS ou regra de negócio.
