# Auditoria Portal do Colaborador: web x celular

## Achado que muda o enunciado da auditoria

Não existem duas experiências do colaborador no projeto. Existe **uma só**, que se adapta ao tamanho da tela.

Verificado no código:

- Um único conjunto de rotas do colaborador, todas dentro de `/dp/meu` (`src/App.tsx`, linhas 329-350). Não há rotas paralelas para celular.
- Uma única casca (`ColaboradorShell` → `DpShell variant="portal"`), usada em qualquer tamanho de tela; o que muda é a barra lateral no computador e a barra inferior + página "Mais" no celular (`MobileBottomNav`, `MobileMoreSheet`, `Mais.tsx`).
- Um único menu declarado em `src/config/dpNavigation.tsx` (`DP_PORTAL_NAV`), do qual o menu do celular é derivado em `src/config/mobileNav.tsx`. Já existe teste automático de paridade (`src/config/mobileNav.parity.test.ts`).
- Não há projeto nativo (nenhum `capacitor.config.*`, nenhuma pasta `ios`/`android`). O "app" é o site instalado na tela inicial (`public/manifest.webmanifest`, `InstalarAppCard.tsx`).
- As 15 telas do colaborador (`src/pages/dp/portal/`) são as mesmas nas duas larguras; nenhuma delas troca de conteúdo por tamanho de tela (nenhuma usa detecção de celular).

Consequência prática: **não pode haver funcionalidade, regra, permissão, documento ou dado que exista no portal do computador e não exista no celular** — é o mesmo código, o mesmo banco e as mesmas permissões. Portanto a matriz "existe na web / não existe no app" seria toda "paridade" por construção, e uma auditoria montada nesse eixo não produziria achados reais.

O que **pode** divergir, e é onde a auditoria tem valor, é: como cada tela se comporta numa tela estreita, como se chega até ela pelo celular, e o que sobrou de coisa pensada para tela grande.

## Auditoria proposta (somente diagnóstico, nenhuma alteração)

Entrego um documento em `.lovable/auditoria/portal-colaborador-web-x-celular.md` com:

1. **Arquitetura confirmada** — rotas, casca, menus, guardas de acesso, como o sistema separa gestor de colaborador, e por que existe uma experiência só.
2. **Inventário das 15 telas do colaborador** — o que cada uma faz, como se chega a ela no computador e no celular, quantos toques até ela.
3. **Comportamento em tela estreita, tela por tela** — tabelas que estouram a largura, botões e textos cortados, janelas que não rolam, campos escondidos pelo teclado, listas longas sem paginação, área segura e rodapé fixo, leitura de PDF no celular.
4. **Navegação no celular** — barra inferior, atalhos, página "Mais", gestos, botão voltar, telas escondidas por vínculo (`hiddenScreens.ts`), coerência dos rótulos curtos.
5. **Início do colaborador** — se o que aparece primeiro é o que ele mais precisa; proposta de hierarquia, sem implementar.
6. **Documentos** — competência, tipo, ordenação, agrupamento, abertura do arquivo, não lidos, estado vazio, erro; se a tela usa corretamente o motor de distribuição já existente (sem tocar nele).
7. **Estados** — carregando, vazio, erro e sucesso, tela por tela.
8. **Identidade visual** — logo, cores, tipografia, cards, cabeçalhos e ícones, comparando computador e celular.
9. **Segurança e permissões** — vínculo do colaborador, empresa, RLS das tabelas do portal, arquivos no cofre, RPCs e funções usadas pelas telas do colaborador; confirmação de que nada depende de identificador enviado pela tela.
10. **Duplicação técnica** — regras repetidas entre telas, oportunidades de unificar em hooks/funções já existentes.
11. **Telas órfãs** — arquivos que continuam no projeto mas cuja rota foi redirecionada (`DpMeuPonto.tsx`, `DpMeuContracheque.tsx`), para decidir manter ou aposentar.
12. **Achados P0 / P1 / P2**, com arquivo e linha, evidência, impacto e recomendação.
13. **Estado técnico atual** — verificação de tipos, lint e testes, separando erro preexistente de achado da auditoria.
14. **Fases futuras sugeridas**, sem executar nada.

## Detalhes técnicos

- Fontes de leitura: `src/App.tsx`, `src/components/dp/ColaboradorShell.tsx`, `DpShell.tsx`, `DpSidebar.tsx`, `DpHeader.tsx`, `src/components/mobile/*`, `src/pages/Mais.tsx`, `src/config/dpNavigation.tsx`, `src/config/mobileNav.tsx`, `src/lib/nav/*`, as 15 páginas de `src/pages/dp/portal/`, os hooks `useDpMeu*`/`useMeusDocumentos`/`useDpPendenciasColaborador`, `src/lib/dp/*` e as funções/políticas usadas por essas telas.
- Verificação de comportamento real em telas estreitas com navegador automatizado em `http://localhost:8080`, larguras 360, 390 e 407 px, além de 768 px e desktop, com capturas anexadas ao documento.
- Consultas de leitura ao banco para conferir RLS e políticas do cofre das tabelas do portal.
- `bunx tsgo --noEmit`, lint e `bunx vitest run` apenas para registrar o estado atual.
- Nenhuma migração, nenhuma alteração de componente, nenhuma alteração de rota ou de política.
