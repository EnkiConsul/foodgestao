## Objetivo
Produzir um **Relatório de Auditoria de Conformidade** do módulo DP deste projeto (360°FOOD) contra o repositório de referência `pakere1996/portalcolaborador` (branch `main`), tratando o **código-fonte** do repo como spec de fato (não existe documentação textual formal no repositório). Nenhum arquivo deste projeto será modificado.

## Fonte da verdade
- Repo: `https://github.com/pakere1996/portalcolaborador` @ `main`
- Deploy: `https://portalcolaborador-gold.vercel.app/` (para tie-break visual)
- Escopo do refer.: `src/pages/**`, `src/components/**`, `src/routes/**` (se houver), `supabase/migrations/**`, `supabase/functions/**`, `AI_RULES.md`, `.sql` da raiz.

## Metodologia (fases)

### Fase 1 — Extração de requisitos do referência
Via `raw.githubusercontent.com` (curl) + `code--fetch_website` para árvore de diretórios:
1. Baixar árvore completa de `src/` e `supabase/` do repo referência.
2. Mapear:
   - **Rotas & páginas** (router + arquivos em `src/pages`)
   - **Formulários** (campos, labels, validações, máscaras)
   - **Componentes de UI** (cards, drawers, modais, badges de status)
   - **Schema Supabase** (tabelas, colunas, tipos, enums, FKs, triggers) a partir de `supabase/migrations/*.sql` e `.sql` da raiz
   - **Políticas RLS** por tabela
   - **RPCs / functions PL/pgSQL** (assinatura, atomicidade)
   - **Edge functions** em `supabase/functions/*` (contrato de entrada/saída)
   - **Perfis/permissões** (admin / gestor / colaborador — como o refer. distingue)
3. Numerar cada requisito verificável (R1, R2, …) em uma tabela mestre.

### Fase 2 — Inventário da implementação local (DP daqui)
Leitura em paralelo dos arquivos já conhecidos:
- `src/pages/dp/**` (DpHome, DpColaboradores, DpFolgas, DpTrocas, DpSolicitacoes, DpAprovacoes, DpDisciplinar, DpBloqueios, DpDocumentos, DpAvisos, DpMensagens, DpFolhaHub, DpFolhaAprovacoes, DpFolhaPeriodo, DpSindicatos, DpSindicatoNegociacoes, DpUnidades, DpCargos, DpCadastrosHub, portal/**)
- `src/components/dp/**` (DpShell, DpSidebar, DpHeader, ColaboradorFormDialog, DpNotificacoesBell, home/*)
- `src/hooks/useDp*.tsx` (Notificacoes, Colaboradores, Comunicacao, Pendencias, Aniversariantes30d, Cadastros)
- Rotas DP em `src/App.tsx`
- Schema local via `supabase--read_query` nas tabelas `dp_*` (colunas, constraints)
- Políticas RLS locais via `pg_policies` para cada tabela `dp_*`
- Funções `dp_*` e `has_role`/`is_dp_colaborador` via `pg_proc`
- Edge functions `supabase/functions/dp-invite-colaborador/*`

### Fase 3 — Matriz de conformidade
Para cada R#: status ∈ {✅ CONFORME, 🟡 PARCIAL, ❌ NÃO CONFORME, ⛔ AUSENTE, ➕ EXTRA} + severidade {CRÍTICA/ALTA/MÉDIA/BAIXA} + evidência com `arquivo:linha` de ambos os lados.

### Fase 4 — Riscos de segurança
Auditoria dedicada:
- Tabelas `dp_*` sem RLS ou com policy permissiva
- Operações críticas não-atômicas (ex.: fechamento de folha, sorteio de folgas, aprovação de troca) que deveriam ser RPC transacional
- Dados sensíveis (CPF, salário, holerite, doc pessoal) expostos fora do perfil
- Validações só no client
- Storage buckets do DP (se houver) — policies

### Fase 5 — Entrega
Documento único em `/mnt/documents/auditoria-dp-360food.md` (e resposta no chat com sumário executivo + matriz completa) contendo:
- A. Sumário Executivo (veredito, % conformidade, top 5)
- B. Matriz de Conformidade (todos os R#)
- C. Extras não documentados (com recomendação)
- D. Riscos de Segurança e Dados
- E. Plano de Correção Priorizado (P/M/G, sem execução)
- F. Ambiguidades (onde o refer. é ambíguo/contraditório consigo mesmo)

## Ferramentas que serão usadas (todas read-only)
- `code--fetch_website` + `curl` p/ `raw.githubusercontent.com` — baixar árvore e arquivos do refer.
- `code--view` + `rg` — inspecionar código local
- `supabase--read_query` — schema, policies, functions locais
- `acp_subagent--spawn_agent` — paralelizar leitura em massa do repo referência para não estourar contexto

## Ferramentas que **não** serão usadas
- Nenhuma escrita: sem `code--write`, `code--line_replace`, `mv`, `rm`, migrations, deploys.

## Restrições
- Sem inventar requisitos: se algo não existe no refer., é 🟢 EXTRA aqui (não vira ❌).
- Toda linha da matriz cita `arquivo:linha` de ambos os lados quando existir.
- Se o repo refer. estiver internamente inconsistente (ex.: schema não bate com página), o item vai para "Ambiguidades" com interpretação sugerida.
- Escopo apenas DP: outros módulos (financeiro, contatos, etc.) fora.

## Estimativa
- Fase 1: ~15–25 leituras remotas do refer. (pesado, mas paralelizável via subagente)
- Fase 2: ~30 arquivos locais + ~15 queries Supabase
- Fase 3–5: consolidação
- Entrega em uma única resposta ao final.

Ao aprovar, saio de plan mode e executo apenas leituras/queries até entregar o relatório.
