## Garantir que links legais apareçam no rodapé da LP

Os links `Privacidade`, `Termos`, `Cookies`, `Gerenciar cookies` e `DPO` já existem em `src/pages/Landing.tsx` (linhas 715–725 do `PublicFooter`), mas:

1. Estão misturados com os links de navegação (Entrar/Planos/FAQ) e visualmente fracos — fáceis de não notar.
2. O publicado em `gestorplin.com` pode estar desatualizado (mudanças ainda não republicadas).
3. Os rótulos não passam pelo CMS, então o super admin não consegue editá-los.

### O que vou fazer

1. **Reestruturar o footer** em `PublicFooter`:
   - Separar em duas linhas/áreas: a primeira com Entrar / Planos / FAQ (navegação), a segunda com **Privacidade · Termos · Cookies · Gerenciar cookies · DPO** (linha legal) em destaque visual, com separador `border-t` sutil entre elas.
   - Aumentar levemente o contraste (`text-muted-foreground` → realçar no hover).

2. **Adicionar campos legais ao CMS** (`src/lib/landing-defaults.ts` → seção `footer`):
   - `link_privacy: "Privacidade"`, `link_terms: "Termos"`, `link_cookies: "Cookies"`, `link_cookie_settings: "Gerenciar cookies"`, `link_dpo: "DPO"`.
   - Atualizar `PublicFooter` para ler esses rótulos via `useLandingSection("footer")` com fallback nos defaults.
   - Atualizar a aba **Rodapé** em `src/pages/admin/LandingPage.tsx` para expor os 5 novos campos editáveis (a `FooterContent` já é tipada via defaults, então os campos novos aparecem automaticamente se o editor for genérico — caso contrário, adicionar manualmente).

3. **Sem mudanças de banco** — `landing_content` já armazena qualquer JSON, então o `deepMerge` cobre as novas chaves.

### Lembrete ao usuário
Após aplicar, clicar em **Publicar** para que `gestorplin.com` receba a versão nova.
