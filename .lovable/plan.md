
# Endurecimento do 360°FOOD — Testes, Tipos e Refactor

Três frentes, executadas nesta ordem para reduzir risco: primeiro criamos rede de segurança (testes), depois ligamos o compilador em modo estrito (que vai apontar bugs reais), e por fim quebramos os monólitos com os testes já cobrindo o comportamento.

Cada frente é entregue em fases pequenas e independentes — você pode aprovar/pausar entre elas.

---

## Frente 1 — Testes da lógica financeira (rede de segurança)

**Objetivo:** cobrir com testes automatizados os pontos onde "dinheiro errado" causa churn imediato, antes de mexer em tipos ou refatorar.

### Fase 1.1 — Parser de extratos
- `src/lib/statement-import/nubankPdf.ts` — casos: extrato multi-página, linhas de continuação, seção entradas vs saídas, hash determinístico para dedupe.
- `src/lib/statement-import/suggest.ts` — match por documento (CNPJ/CPF), match por histórico (tokens ≥ 4 chars), score ≥ 2.
- `markDuplicates` — dedupe contra banco + dedupe intra-arquivo.
- Fixtures de PDF/OFX em `src/lib/statement-import/__fixtures__/`.

### Fase 1.2 — Cálculo de saldo e sinal de transação
- `src/lib/transaction-sign.ts` — entrada/saída/transferência, parcelada, estorno.
- Regras de `useCompanyContext` para filtro PF/PJ.
- Confirmação de status (pendente → pago) e efeito no saldo.

### Fase 1.3 — Webhook Asaas
- `supabase/functions/asaas-webhook/index.ts` — dedupe por `event_id`, mapeamento de status (PAYMENT_CONFIRMED, RECEIVED, OVERDUE, REFUNDED), atualização de assinatura.
- Mock do cliente Supabase; garantir idempotência.

### Fase 1.4 — DRE / Relatórios contábeis
- `src/hooks/useContabeisReport.tsx` — agrupamento por subtipo (receita/custo/despesa/imposto/investimento), totais mensais e anuais, hierarquia de categorias.

**Meta:** sair de 7 arquivos de teste para ~25, cobrindo 100% dos caminhos que movem dinheiro.

---

## Frente 2 — `strictNullChecks` incremental

**Objetivo:** ligar `strictNullChecks` em módulos críticos primeiro, arquivo a arquivo, sem quebrar o build. As outras flags (`strict`, `noImplicitAny`) ficam para uma segunda rodada.

### Estratégia
Não dá para ligar `strictNullChecks: true` no `tsconfig.app.json` de uma vez (centenas de erros). Vamos usar a diretiva `// @ts-check` inversa: manter o projeto permissivo e ativar checagem estrita **por arquivo** via um segundo tsconfig de "arquivos endurecidos".

- Criar `tsconfig.strict.json` que estende o app e ativa `strictNullChecks: true` + `include` restrito à lista de arquivos já saneados.
- Adicionar step no CI: `tsc -p tsconfig.strict.json --noEmit` (falha se algum arquivo da lista voltar a ter erro null).
- Nunca remove arquivo da lista — só adiciona.

### Ordem de migração (por raio de blast financeiro)

1. **`src/lib/`** inteiro — utils puros, isolados, baixo custo. (~15 arquivos)
2. **`src/lib/statement-import/`** — reforça a Frente 1.
3. **`src/hooks/useCompanyContext.tsx`**, **`useBilling.tsx`**, **`useContabeisReport.tsx`** — hooks centrais.
4. **`src/components/transactions/`** — form e diálogos de lançamento.
5. **`src/pages/Lancamentos.tsx`**, **`FluxoCaixa.tsx`**, **`Relatorios.tsx`** — telas de dinheiro.
6. **`supabase/functions/asaas-*`** — webhook e checkout.

Cada arquivo saneado entra na lista do `tsconfig.strict.json` e vira PR pequeno com bugs de null reais corrigidos (que é o valor real do exercício).

---

## Frente 3 — Quebra dos monólitos

**Objetivo:** reduzir o raio de blast dos 3 maiores arquivos. **Só começa depois que Frente 1 tem testes cobrindo o comportamento deles** — refatorar sem teste é apostar de novo.

### Fase 3.1 — `TransactionFormDialog.tsx` (1.796 linhas)
Extrair em:
- `useTransactionForm.ts` — estado + validação Zod + submit.
- `TransactionBasicFields.tsx` — descrição, valor, data, conta.
- `TransactionCategoryPicker.tsx` — categoria + contato + RPC lookups.
- `TransactionInstallmentsSection.tsx` — parcelamento.
- `TransactionRecurrenceSection.tsx` — recorrência.
- `TransactionAttachmentsSection.tsx` — anexos.
- `TransactionFormDialog.tsx` — só orquestração (~200 linhas).

### Fase 3.2 — `Lancamentos.tsx` (1.773 linhas)
Extrair em:
- `useLancamentosQuery.ts` — query builder (respeitando a regra de performance de select strings da knowledge).
- `useLancamentosFilters.ts` — estado de filtros.
- `LancamentosToolbar.tsx` — filtros + ações em lote.
- `LancamentosTable.tsx` — tabela + inline edit.
- `LancamentosBulkActions.tsx` — confirmações em lote.
- `Lancamentos.tsx` — layout (~250 linhas).

### Fase 3.3 — `DpBloqueios.tsx` (932 linhas)
Extrair em:
- `useDpBloqueios.ts` — CRUD + regeneração de calendário.
- `BloqueioFormDialog.tsx`
- `BloqueiosCalendar.tsx`
- `DpBloqueios.tsx` — layout (~150 linhas).

**Regra:** cada extração é uma migração de código puro (sem mudar comportamento). Rodamos os testes da Frente 1 antes e depois.

---

## Fora do escopo (intencionalmente)

- **Revisão estratégica de verticais** (o item 4 do Claude) — decisão de produto, não técnica. Se quiser discutir, faço em conversa separada, sem código.
- Ligar `strict: true` completo (com `noImplicitAny`) — segunda rodada, depois do `strictNullChecks` cobrir os módulos críticos.
- Refatorar arquivos < 500 linhas — custo/benefício não compensa agora.

---

## Detalhes técnicos

- Testes: Vitest + Testing Library já configurados (`vitest.config.ts`, `src/test/setup.ts`).
- Fixtures binárias (PDF) vão para `src/lib/statement-import/__fixtures__/` e são lidas via `fs` no ambiente jsdom.
- Mocks do Supabase: helper `src/test/mocks/supabase.ts` (a criar) que devolve builder tipado — segue a regra de `.returns<T>()` da knowledge.
- Edge functions testadas com Deno test runner ou adaptador Node — a definir na Fase 1.3.
- CI: adicionar job `strict-typecheck` em `.github/workflows/ci.yml` que roda `tsc -p tsconfig.strict.json`.
- Nenhuma mudança de schema/DB nesta iniciativa.

---

## Ordem de execução sugerida

Começo pela **Fase 1.1** (parser de extratos) — é o teste mais isolado, valida a infra de testes, e destrava as demais. Depois seguimos linearmente. Cada fase é ~1 entrega, você aprova entre elas.

Confirma que posso começar por 1.1?
