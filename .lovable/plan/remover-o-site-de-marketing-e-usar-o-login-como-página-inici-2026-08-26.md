# Remover o site de marketing e usar o login como página inicial

## O que muda para o visitante

- Quem abre `gestor360food.com` cai direto na tela de acesso (Entrar / Criar conta), sem passar pela landing page.
- Quem já está logado continua sendo levado para o Hub (ou para o Portal do Colaborador, quando for o caso).
- As páginas institucionais do site saem do ar: home, Financeiro, Pessoas (Departamento Pessoal), Planos público, Cases, Blog, Quem Somos e Contato. Esses endereços passam a redirecionar para a tela de acesso.
- Continuam funcionando: Termos, Privacidade, Cookies, Encarregado de Dados, o guia DAS MEI, Buscar e o cancelamento de e-mails.
- `/planos` passa a ser só a tela de planos da conta (para usuário logado); visitante é enviado ao login.

## O que muda no código

1. `src/App.tsx`
   - `RootGate`: quando não há usuário, renderizar a tela de acesso (`Auth`) em vez de `HomePage`.
   - Remover as rotas `/financeiro`, `/departamento-pessoal`, `/contato`, `/quem-somos`, `/cases`, `/cases/:slug`, `/blog`, `/blog/:slug` e trocá-las por redirecionamento para `/`.
   - `PlanosGate`: visitante passa a ser redirecionado para `/` em vez de ver `PlanosSitePage`.
   - Remover os imports lazy das páginas de marketing.
2. Excluir os arquivos `src/pages/marketing/**` e `src/components/marketing/**` (usados apenas por essas páginas), além de `src/lib/marketing/content.ts` e do hook `useMarketingContent` se ficarem sem uso.
3. `index.html`: ajustar título/descrição para a tela de acesso do 360°FOOD.
4. O `sitemap.xml` já não lista páginas de marketing — nenhuma mudança necessária.

## Detalhes técnicos

- A tela em `/` reaproveita `src/pages/Auth.tsx` dentro do mesmo guard de rota pública (`PublicOnlyRoute` já cobre `/auth`), mantendo abas Entrar e Criar conta, Google, MFA e o parâmetro `redirect`.
- `/auth`, `/login` e `/dp/login` seguem válidos apontando para a mesma tela.
- Nenhuma mudança de banco de dados. Conteúdo de marketing que exista no banco permanece intocado, apenas deixa de ser exibido.
