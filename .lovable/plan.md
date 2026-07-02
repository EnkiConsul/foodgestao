
## Diagnóstico

- **Não existe limite server-side** de lançamentos por plano. O campo `max_transactions_per_month` só é exibido em marketing/planos; nenhum trigger, RPC ou verificação bloqueia inserts.
- Verifiquei sua conta (plano **Business = ilimitado**) e o banco:
  - Zero lançamentos em `transaction_date` de junho/2026 para o seu usuário.
  - Zero lançamentos com `import_hash` preenchido em todo o banco (nem seus, nem de outros usuários).
  - Sem erros de Postgres relacionados a `transactions` nos últimos dias.
- Conclusão: quando você clica **"Importar N lançamento(s)"**, algum lote de 100 está falhando por completo (trigger de validação, RLS, constraint, etc.) e a falha é engolida — o toast mostra só um total, sem apontar quais linhas quebraram nem por quê.

## O que vou entregar

### 1. Import à prova de falhas em `ImportStatementDialog.tsx`

- Trocar `insert(slice, {count})` por um pipeline que:
  1. Tenta o lote (chunk de 50).
  2. Se o lote falhar por qualquer motivo, cai para **insert individual** de cada linha do lote, capturando erro por linha.
  3. Classifica cada linha em `importada`, `duplicada` (`23505`) ou `erro` com a mensagem retornada pelo Postgres.
- Barra de progresso ("Importando 45 / 119…").

### 2. Resumo transparente no passo final

- Substituir o "N lançamento(s) importado(s)" por um bloco com três contadores:
  - ✅ Importados
  - ⚠️ Duplicados (já existiam)
  - ❌ Não importados — lista **cada linha com data, valor, descrição e o motivo do erro** (mensagem do banco), com botão "Voltar para revisar" que retorna ao passo de revisão só com as linhas com erro pré-selecionadas para o usuário corrigir (ex.: definir categoria, contato ou trocar de conta).

### 3. Coleta de motivos frequentes já no passo de revisão

- Antes de importar, validar client-side as regras que hoje quebram silenciosamente:
  - `account_id` selecionado (já valida).
  - Coerência entre `contextType` e a conta escolhida.
  - Se `contextType='pj'` e faltar `company_id`, bloqueia com mensagem clara.
- Mostrar essas mensagens inline no cabeçalho da revisão.

### 4. Ajuste no `import_hash` (defensivo)

- Manter o hash atual (compatível com a lógica anterior), mas garantir que ele **realmente vai no payload** — hoje ele é montado, mas se um lote inteiro cai antes de persistir, o hash nunca chega ao banco (explica os zero `import_hash IS NOT NULL`). Com o fallback individual, cada linha bem-sucedida gravará o hash.

### 5. Confirmar ausência de limite (nada a mudar no backend)

- Documentar no dialog um pequeno subtítulo: "Sem limite de importação — todos os lançamentos do extrato podem ser importados". Sem alterações em schema/triggers/planos.

## Detalhes técnicos

- Arquivo alterado: `src/components/transactions/ImportStatementDialog.tsx`.
- Sem migração; sem alteração em `transactions`, `plans`, `usage_counters`.
- Retry individual usa `Promise.all` com concorrência limitada (5 em paralelo) para não estourar a conexão.
- Cada erro individual passa por um mapeador simples:
  - `23514` / mensagem contendo "Forma de pagamento" → "Forma de pagamento não vinculada à conta/perfil".
  - `42501` → "Sem permissão para gravar neste perfil/empresa".
  - `23505` → duplicata (silenciada, contada em "já existiam").
  - default → mensagem literal do Postgres.

## O que **não** vou fazer nesta entrega

- Não vou implementar enforcement de `max_transactions_per_month` no backend (a menos que você peça — hoje ele é só informativo).
- Não vou tocar no parser (já está extraindo as 119 linhas corretamente).
- Não vou alterar tabelas nem RLS.

## Como validar depois

1. Reimportar o mesmo PDF de junho/2026.
2. Ver o resumo final: quantas importadas, quantas duplicadas e — se houver — a lista exata de linhas rejeitadas com o motivo.
3. Se aparecerem erros, corrijo o motivo apontado (ex.: vincular a categoria à empresa) ou volto para revisar as linhas problemáticas.
