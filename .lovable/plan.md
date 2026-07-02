# Importação de Extrato Bancário

Nova funcionalidade para importar extratos (começando pelo Nubank PDF) e gerar lançamentos automaticamente, com sugestão de categoria, contato (cliente/fornecedor) e vínculo com a conta bancária escolhida. O usuário revisa e confirma antes de gravar.

## Fluxo do usuário

1. Em **Lançamentos**, novo botão **"Importar Extrato"** (ao lado de "Novo Lançamento").
2. Dialog em 3 passos:
   - **1. Upload**: seleciona a conta bancária de destino + arquivo (PDF Nubank nesta v1; estrutura pronta para OFX/CSV depois).
   - **2. Revisão**: tabela editável com todas as movimentações extraídas. Cada linha mostra: data, descrição original, valor, tipo (receita/despesa), sugestão de **categoria**, sugestão de **contato** (cliente p/ receita, fornecedor p/ despesa), status (pago) e checkbox "importar".
     - Detecção de duplicatas: linhas que já existem na conta/data/valor vêm desmarcadas e sinalizadas.
     - Usuário pode editar categoria/contato/descrição por linha ou aplicar em lote (multi‑seleção).
   - **3. Confirmação**: resumo (X entradas, Y saídas, Z duplicatas ignoradas) e botão **Importar**.
3. Após importar: toast com resultado, tabela de lançamentos e saldo da conta atualizam via realtime.

## Regras de negócio

- Todos os lançamentos criados ficam com `status = 'confirmado'`, `payment_date = data do extrato`, `amount_paid = amount`, vinculados à conta escolhida e ao contexto/empresa ativos.
- Transferências entre contas próprias detectadas (Pix/TED com CNPJ da própria empresa) são marcadas como `transferencia` só se o usuário indicar a conta destino; padrão é receita/despesa comum.
- Nada é gravado sem confirmação explícita na etapa 3.

## Categorização automática (heurística determinística)

Ordem de prioridade para sugerir categoria e contato:

1. **Histórico do próprio usuário**: normaliza a descrição (uppercase, sem acentos, sem CNPJ/valores) e procura transações passadas com descrição similar (LIKE + trigram) no mesmo contexto/empresa. Reusa `category_id` e `contact_id` da correspondência mais recente.
2. **Match por CNPJ/CPF** presente na descrição contra `contacts.document`.
3. **Regras por palavra‑chave** (tabela nova `import_rules`, editável no futuro; nesta v1 seed com defaults: "pix recebido"/"transferência recebida" → receita; "tarifa", "iof", "anuidade" → despesa "Tarifas Bancárias"; etc.).
4. Fallback: sem categoria (usuário escolhe na revisão).

Contatos novos NÃO são criados automaticamente nesta v1 — a linha fica sem contato se não houver match. (Podemos adicionar "criar contato a partir do extrato" em uma iteração seguinte.)

## Parsing (v1: Nubank PDF)

- Parse feito **no cliente** com `pdfjs-dist` (já disponível no bundle, sem edge function).
- Extração baseada em regex de linhas do padrão observado no modelo: cabeçalho `DD MMM AAAA` que agrupa movimentos, cada movimento com título ("Transferência recebida pelo Pix", "Compra no débito", "Pagamento de boleto efetuado", etc.), contraparte (nome + CNPJ) e valor com sinal.
- Sinal do valor: presença de "recebida"/"entradas"/"+" ⇒ receita; "enviada"/"saídas"/"−" ⇒ despesa.
- Estrutura de parser isolada em `src/lib/statement-import/` com um parser por formato (`nubankPdf.ts`) retornando `ParsedStatementEntry[]` — facilita adicionar OFX/CSV depois.

## Arquivos a criar/editar

- `src/lib/statement-import/types.ts` — tipos `ParsedStatementEntry`, `ImportSuggestion`.
- `src/lib/statement-import/nubankPdf.ts` — parser PDF.
- `src/lib/statement-import/suggest.ts` — heurística de categoria/contato consultando Supabase.
- `src/components/transactions/ImportStatementDialog.tsx` — wizard de 3 passos.
- `src/pages/Lancamentos.tsx` — botão "Importar Extrato" + integração.
- Migration:
  - Adicionar coluna `import_hash text` em `transactions` + índice único parcial `(user_id, account_id, import_hash)` para deduplicação idempotente.
  - Nova tabela `public.import_rules` (user_id, pattern, transaction_type, category_id, contact_id) com RLS + GRANTs padrão (usuário gerencia as suas).

## Fora do escopo desta v1

- OFX/CSV (estrutura preparada, parsers adicionais em iteração futura).
- Criação automática de novos contatos.
- Aprendizado automático (salvar regra a partir de uma edição manual) — pode virar toggle "lembrar essa escolha" na v2.
- Reconciliação de lançamentos pré‑existentes (só marcamos duplicata para o usuário desmarcar).

Confirma o escopo assim ou quer ajustar algum ponto (ex.: criar contatos novos automaticamente, ou já incluir OFX)?