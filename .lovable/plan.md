## Recomendação

**Refatorar página a página, usando o repositório `pakere1996/portalcolaborador` como fonte única de verdade. Não deletar o módulo nem o banco.**

Por quê:
- Você já tem cadastros reais no `dp_*` (colaboradores, unidades, folgas, escalas, documentos). Apagar tudo custa reimportação + retrabalho de revisão — não economiza tempo.
- Já confirmei via GitHub API que o problema é de **estrutura de páginas e design**, não de modelo de dados. As tabelas e RLS atuais atendem o que a doc descreve.
- Reescrever "do zero via prompt" reproduz o mesmo desalinhamento se não houver um checklist tela-a-tela. O ganho vem do checklist, não do delete.

Só recomendaria zerar se a doc definisse um schema de dados incompatível. Não é o caso.

## Mapa das telas da documentação (confirmado no repo)

**Área do colaborador (`src/pages/*`)**
- `Home.tsx`, `Login.tsx`, `SetupAdmin.tsx`, `Perfil.tsx`
- `Calendario.tsx` (calendário geral)
- `Trocas.tsx`, `Historico.tsx`
- `Documentos.tsx` + `DocumentosAtestados.tsx`, `DocumentosDisciplinar.tsx`, `DocumentosSindicato.tsx`

**Área admin (`src/pages/admin/*`)**
- `HomeAdmin.tsx`
- `CadastroHub.tsx` → `Colaboradores.tsx`, `Cargos.tsx`, `Unidades.tsx`
- `FolgasHub.tsx` → `Calendario.tsx`, `Solicitacoes.tsx`, `Trocas.tsx`, `Bloqueios.tsx`, `Aprovacoes.tsx`
- `Documentos.tsx` → `DocumentosContracheque.tsx`, `DocumentosAdiantamento.tsx`, `DocumentosPontoAdmin.tsx`, `DocumentosHistoricoCompleto.tsx`, `AtestadosAdmin.tsx`, `RegistrosDisciplinaresAdmin.tsx`
- `ComunicacaoHub.tsx` → `Mensagens.tsx`, `QuadroAvisos.tsx`
- `SindicatosHub.tsx` → `SindicatosCadastro.tsx`, `SindicatosNegociacoes.tsx`

Nosso módulo hoje cobre parte disso mas com nomes, hubs e layouts diferentes. Alguns hubs da doc não existem no nosso (Comunicação, Sindicatos, Aprovações). Alguns existem no nosso mas não na doc (ex.: telas de importação em massa).

## Plano de refatoração

### Etapa 1 — Diagnóstico detalhado (sem código)
Leio cada arquivo da doc via `raw.githubusercontent.com` e entrego um relatório único com, por tela:
- Nome doc × nome atual (ou "novo")
- Estrutura (hub? subrota? campos?)
- Design (layout, popups, cards)
- Ações e estados
- Se o schema atual atende ou pede migration aditiva

Deliverable: `.lovable/dp-diagnostico.md`. Sem alteração de código.

### Etapa 2 — Casca do módulo (padrões reutilizáveis)
Uma iteração pequena para consolidar antes de mexer em tela:
- `DpSidebar` alinhado à árvore de navegação da doc (nova ordem de itens, novos hubs)
- Componentes: `DpPage`, `DpPageHeader`, `DpContentCard`, `DpFilterCard`, `DpHubGrid` (grid de cards de submódulo), `DpDayDialog` (o popup de dia que já fizemos, extraído em componente)
- `FavoriteToggle` e persistência de filtros mantidos como padrão
- Roteamento: manter rotas atuais e adicionar redirects para nomes novos, para não quebrar links salvos

### Etapa 3 — Refatoração por submódulo, um por iteração
Ordem sugerida (do mais "vitrine" para o interno):

1. **Cadastros** — hub + Colaboradores, Cargos, Unidades
2. **Folgas** — hub + Calendário Geral, Solicitações, Trocas, Bloqueios, Aprovações
3. **Documentos** — hub + subtelas (Contracheque, Adiantamento, Ponto, Histórico, Atestados, Disciplinar)
4. **Comunicação** — hub + Mensagens, Quadro de Avisos (novo)
5. **Sindicatos** — hub + Cadastro, Negociações (novo)
6. **Home DP (dashboard)** — por último, consome dados de todas

Para cada submódulo: **estrutura → design → popups/diálogos → filtros persistidos → verificação Playwright na preview**. Nada avança sem screenshot conferido.

### Etapa 4 — Migrations aditivas se o diagnóstico exigir
Se algum campo/tabela da doc não existir hoje, faço migration **só aditiva**: novas colunas com default seguro, novas tabelas com RLS + GRANTs. Nunca `DROP`. Se algo virar legado, marco como deprecated no código, não no schema.

### Detalhes técnicos

- Nada é deletado no banco. Tabelas `dp_*`, políticas e triggers preservados.
- Rotas atuais mantidas; nomes novos ganham redirect via `Navigate` no React Router.
- Preferências (favoritos, filtros) via `localStorage` no mesmo padrão do Calendário.
- Verificação por etapa: `bunx tsgo --noEmit` + Playwright headless abrindo a tela, o popup e um filtro, checando console limpo.
- Reference source: `https://github.com/pakere1996/portalcolaborador` (branch `main`).

## O que preciso de você para começar

Confirmação para começar pela **Etapa 1 (diagnóstico)** — leio cada arquivo do repo, gero `.lovable/dp-diagnostico.md` e paro para você validar o mapeamento antes de tocar em qualquer código. Se preferir pular o diagnóstico e ir direto pelo Cadastros seguindo a doc, também dá — só é mais provável precisarmos voltar depois em telas que hoje divergem.
