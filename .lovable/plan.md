# Duplicidade na importação em massa — confirmar substituição

## Problema

Ao aprovar um lote, se já existe documento para `(colaborador, tipo, referencia_data)`, a Edge `dp-doc-bulk-approve` marca o item como `status = "failed"` com `error_message = "Já existe documento..."`. Na revisão, essa combinação é renderizada como **"Falha no OCR"** (rótulo fixo em `BulkReviewInline.tsx:378`), o que é enganoso — não foi falha de OCR, foi bloqueio de duplicidade. Além disso, hoje não há como o usuário decidir substituir a página duplicada; ele precisa apagar o documento antigo manualmente.

## Solução

Detectar duplicidades **antes** de chamar a Edge e pedir confirmação explícita ao usuário; passar a decisão para o backend, que substitui (ou pula) os documentos duplicados.

### 1. Frontend — pré-checagem + diálogo de confirmação

Em `BulkReviewInline.tsx` e `BulkReviewDialog.tsx`, ao clicar em **Aprovar e Salvar**:

1. Montar a lista de itens elegíveis (pendentes com colaborador vinculado).
2. Fazer um único `select` em `dp_documentos` filtrando por `company_id`, `tipo` do lote e as tuplas `(colaborador_id, referencia_data)` dos itens. Cruzar em memória para descobrir quais itens têm colisão.
3. Se houver colisões, abrir um `AlertDialog` novo (`ConfirmarSubstituicaoDialog.tsx`) listando: nome do colaborador, competência, e a badge "já existe". Botões:
   - **Cancelar** (não envia nada).
   - **Pular duplicados** — envia apenas os não-colidentes com `on_duplicate: "skip"`.
   - **Substituir duplicados** — envia todos com `on_duplicate: "replace"`.
4. Se não houver colisões, segue direto (comportamento atual).

### 2. Backend — `dp-doc-bulk-approve`

- Estender `BodySchema` com `on_duplicate: z.enum(["skip", "replace"]).default("skip")`.
- No bloco de duplicidade (linhas 74–92):
  - Se `on_duplicate === "replace"`: apagar o storage do documento antigo (`svc.storage.from("dp-documentos").remove([dup.file_path])`) e o registro em `dp_documentos`; seguir o fluxo normal de upload/insert. Retornar `{ ok: true, replaced: true }`.
  - Se `on_duplicate === "skip"`: **não** marcar o item como `failed`. Manter `status = "pending"` (não decidido) e retornar `{ ok: false, error: "duplicate" }` sem gravar `error_message`. Assim o item continua disponível para nova ação e não vira "Falha no OCR".
- Aumentar o `select` da duplicata para trazer `file_path` (necessário para `storage.remove`).

### 3. Rótulo de erro no review

Em `BulkReviewInline.tsx:378` e no equivalente do `BulkReviewDialog.tsx`, quando `current.status === "failed"`, exibir `current.error_message` (com fallback para "Falha no processamento") em vez do texto fixo "Falha no OCR". Duplicidade, após o ajuste acima, deixa de cair nesse caminho.

## Fora do escopo

- Não mudar o fluxo de OCR/ingest.
- Não mexer em RLS.
- Nenhuma migração de schema (apenas comportamento).

## Como validar

1. Aprovar um lote em que um dos colaboradores já tem contracheque na mesma competência.
2. Deve abrir o diálogo listando o item duplicado com 3 opções.
3. Escolher **Substituir**: o documento antigo desaparece do histórico e o novo aparece com `revisado_em` atualizado.
4. Escolher **Pular**: os não-duplicados são importados; o item duplicado continua `pending` (sem badge "Falha no OCR").
5. Cancelar: nada é enviado.
