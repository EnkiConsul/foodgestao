# Rebrand: Gestor Plin → 360°FOOD

Rebrand completo da plataforma adotando o nome **360°FOOD** e a identidade visual (laranja `#EB6119` + marinho `#0F1B3D` + branco) das logomarcas enviadas.

## 1. Assets da nova marca

Subir para Lovable Assets (CDN) a partir de `/mnt/user-uploads/`:

- `360food-horizontal.png` (2400×600 — laranja+branco sobre marinho) → logo principal (sidebar, header, e-mails)
- `360food-horizontal-mono.png` (versão só laranja/branco em fundo transparente) → variantes
- `360food-icon.png` (1024×1024 app icon marinho) → ícone / favicon / PWA
- `360food-avatar-round-marinho.png` → avatares/OG
- `360food-master.svg` → uso vetorial (fallback)

Depois:
- Substituir `src/assets/gestorplin-horizontal.png.asset.json`, `gestorplin-icon.png.asset.json`, `gestorplin-appicon.png.asset.json` pelos novos `360food-*.asset.json`
- Gerar novo `public/favicon.png` (256×256) e `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` a partir do app icon
- Remover `public/favicon.ico` e `public/logo-gestor-plin.png` / `src/assets/logo-gestor-plin.png`

## 2. Design tokens (paleta)

Reescrever `src/index.css` — trocar paleta teal/cyan atual pela paleta 360°FOOD:

- `--primary`: laranja `#EB6119` (HSL ~ `18 84% 51%`)
- `--sidebar-background` / navy base: `#0F1B3D` (HSL ~ `224 60% 15%`)
- `--sidebar-primary` (accent na sidebar): laranja `#EB6119`
- `--accent`: laranja claro derivado
- `--secondary`, `--muted`: cinzas neutros harmonizados
- `--ring`: laranja
- Manter `--success` (verde), `--warning` (âmbar), `--destructive` (vermelho) recalibrados para conviver com a nova primária
- Dark mode: fundo marinho profundo `#0A1230`, cards `#141F45`, primary laranja mantido
- Atualizar `manifest.webmanifest`: `theme_color: "#0F1B3D"` (já é), `background_color: "#0F1B3D"`, `name`/`short_name`/`description` para 360°FOOD

Tokens ficam semânticos — nenhum componente hardcoda cores.

## 3. Componente `Logo`

`src/components/Logo.tsx`:
- Trocar imports para os novos `.asset.json`
- Trocar `alt="Gestor Plin"` → `alt="360°FOOD"`

`AppSidebar.tsx`:
- Header do sidebar: ícone 360°FOOD + texto "360°" (laranja) + "FOOD" (branco) no lugar de "Gestor" + "Plin"

## 4. Substituição textual "Gestor Plin" → "360°FOOD"

Aplicar em todos os arquivos onde a string aparece (busca já feita, 40+ arquivos):

- `index.html` (title, meta description, og:title, og:description, twitter)
- `public/manifest.webmanifest`, `public/llms.txt`, `public/robots.txt`, `public/sitemap.xml`
- `src/pages/Landing.tsx`, `Auth.tsx`, `Onboarding.tsx`, `ResetPassword.tsx`, `TrialExpired.tsx`, `Unsubscribe.tsx`, `AcceptInvite.tsx`
- `src/pages/legal/*` (Termos, Privacidade, Cookies, EncarregadoDados) — descrições meta
- `src/pages/admin/LandingPage.tsx`, `SeoIndexacao.tsx`
- `src/pages/relatorios/Contabeis.tsx`, `ContasContabeis.tsx`, `guias/DasMei.tsx`
- `src/lib/landing-defaults.ts`, `legal-defaults.ts`
- `src/components/landing/ContactSection.tsx`, `pwa/InstallPrompt.tsx` (+ teste), `auth/MfaEnrollRequired.tsx`, `legal/LegalDocumentView.tsx`, `settings/ExportMyDataCard.tsx`
- Edge functions: `send-transactional-email`, `accept-invite`, `inspect-search-console`, `asaas-create-checkout`, `ai-financial-agent`, `_shared/plin-ia-context.ts`, `_shared/asaas.ts`, templates de e-mail (`contact-lead`, `company-invite`)

Preservar comportamento — apenas troca de nome de marca e assets. Nenhuma mudança em regras de negócio, RLS, tabelas ou rotas.

## 5. Memória do projeto

Atualizar `mem://index.md` e `mem://style/visual-identity` refletindo:
- Novo nome: 360°FOOD
- Nova paleta primária laranja `#EB6119` + marinho `#0F1B3D`
- Substituir a regra "TreePine + texto Gestor Plin" pela nova (logo 360°FOOD com ícone importado)

## Detalhes técnicos

- Nenhuma migração SQL nova, nenhuma alteração em `supabase/config.toml`.
- `src/integrations/supabase/client.ts` e `types.ts` intocados.
- Nome do domínio publicado (`foodgestao.lovable.app`) já casa com o novo nome — sem mudanças.
- Edge functions alteradas serão automaticamente redeployadas.
- Após o rebrand, rodar smoke visual (sidebar, landing, auth, PDF export do relatório usa nome da marca) para validar contraste do laranja sobre marinho e legibilidade em dark mode.

## Fora do escopo

- Renomear o repositório/URL do projeto Lovable
- Redesenhar layouts / componentes (só troca de tokens + textos + logo)
- Criar novas páginas de marketing
