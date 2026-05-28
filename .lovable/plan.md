# Editor de conteúdo da Landing Page (super admin)

Hoje só os **cards de planos** são editáveis pelo super admin. Todo o resto da LP (Hero, comparativo, personas, recursos, garantia, FAQ, CTA final, rodapé) está **hardcoded** em `src/pages/Landing.tsx`. Esta proposta torna **todos os textos da LP** editáveis pelo painel admin, sem mexer em planos (que já estão prontos).

## O que ficará editável

1. **Hero** — badge superior, título (com destaque em azul), subtítulo, 3 bullets de garantia, rótulo dos 2 botões (primário/secundário), 3 selos de confiança (4.9 satisfação / usado por… / mobile e desktop).
2. **Faixa de personas** — título da faixa + lista de tags ("MEI", "Autônomos"…).
3. **Comparativo Planilha vs Plin** — eyebrow, título, subtítulo, linhas da tabela (recurso / planilha / Plin), rótulo do CTA.
4. **Cards de personas** (Pessoal / MEI / Empresa) — tag, título, 3 bullets e rótulo do CTA de cada card.
5. **Recursos** — eyebrow, título, e a lista de 6 cards (ícone, título, descrição).
6. **Faixa de garantia** — título e subtítulo.
7. **Seção de planos** — eyebrow, título e subtítulo (cards continuam vindo da tabela `plans`, já editável).
8. **FAQ** — eyebrow, título e a lista de perguntas/respostas.
9. **CTA final** — título, subtítulo e rótulo do botão.
10. **Rodapé** — texto de copyright e links.

Cores, layout, ícones e animações **não** entram no editor (mantidos no código).

## Como funciona

- Uma nova página em `/admin/landing-page` no painel admin, organizada em **abas** (uma aba por seção da LP) com formulários simples (inputs, textareas e listas com adicionar/remover/reordenar para itens repetidos como bullets, FAQ, recursos, linhas da tabela).
- Cada aba tem **Salvar** + **Restaurar padrão** (volta ao texto original).
- A LP pública lê o conteúdo do banco; se algum campo ainda não foi salvo, usa o texto padrão atual como **fallback** (zero risco de página em branco).
- Cache curto no client (60s) para não pesar no carregamento da LP.

## Detalhes técnicos

- **Tabela nova**: `landing_content (id, section text unique, content jsonb, updated_at, updated_by)`.
  - GRANTs: `SELECT` para `anon` e `authenticated` (LP é pública), `ALL` para `service_role`.
  - RLS: `SELECT` liberado para todos; `INSERT/UPDATE/DELETE` apenas via `is_super_admin(auth.uid())`.
  - Uma linha por seção (`hero`, `personas_strip`, `comparison`, `persona_cards`, `features`, `guarantee`, `pricing_intro`, `faq`, `final_cta`, `footer`).
- **Defaults**: arquivo `src/lib/landing-defaults.ts` espelha exatamente o texto atual da LP (fonte da verdade para fallback e para o botão "Restaurar padrão").
- **Hook** `useLandingContent(section)` com React Query (staleTime 60s) que faz merge `defaults ⟵ banco`.
- **Refator do `Landing.tsx`**: cada subcomponente (`HeroSection`, `ComparisonSection`, etc.) passa a consumir o hook; nenhuma string visível fica hardcoded.
- **Admin**: novo `src/pages/admin/LandingPage.tsx` + componentes por aba em `src/components/admin/landing/` (Hero, Comparison, PersonaCards, Features, Faq, etc.). Validação leve com Zod, toast de sucesso e `useUpsertLandingSection` (invalida o cache da LP).
- **Rota**: adicionar `<Route path="/admin/landing-page" …/>` em `App.tsx` dentro do `SuperAdminRoute` e item no `AdminSidebar`.
- **Auditoria**: cada salvamento chama `insert_audit_log('landing_section_updated', 'landing_content', section)`.

## Fora de escopo

- Edição de planos (já existe em `/admin/planos`).
- Edição de imagens/ícones do mockup do Hero (mantido visual).
- Multi-idioma e versionamento/preview com rascunho — apenas publicação direta.

## Entregáveis

- 1 migração SQL (tabela + RLS + GRANTs).
- `src/lib/landing-defaults.ts`, `src/hooks/useLandingContent.tsx`.
- `Landing.tsx` refatorado para ler do hook (sem mudança visual).
- `src/pages/admin/LandingPage.tsx` + componentes por aba.
- Rota e item de menu no admin.
