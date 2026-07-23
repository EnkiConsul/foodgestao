# Fix — Detecção automática de competência

## Problema
No contracheque importado o cabeçalho traz "Folha Mensal — Junho de 2026", mas o campo Competência ficou vazio na revisão. A função `extractPeriodo` em `supabase/functions/dp-doc-bulk-ingest/index.ts` não capturou o padrão.

## Causa provável
1. `extractPeriodo` só reconhece:
   - `comp/competencia/referencia/periodo` + `MM/YYYY|MM-YYYY`
   - `MES YYYY` com até 10 caracteres não-numéricos entre nome e ano
   - `MM/YYYY` ou `MM-YYYY` isolados
   
   Não cobre `MM.YYYY` (formato do nome do arquivo "Recibo de Pagamento 06.2026.pdf") nem variações onde o OCR pode retornar "Junho/2026" seguido de mais texto antes do ano. Também não usa o nome do arquivo original como fallback.

2. Não há fallback para o `original_filename` do batch, que quase sempre traz a competência.

## Correções

### A. `supabase/functions/dp-doc-bulk-ingest/index.ts`

1. **Ampliar `extractPeriodo(text)`**:
   - Aceitar separador `.` em `MM.YYYY` (`r3` → `[\/\-\.]`).
   - Após tentar o texto OCR, deixar a função retornar `null` normalmente.

2. **Novo helper `extractPeriodoFromFilename(name)`** que reaproveita os mesmos padrões (`MM.YYYY`, `MM/YYYY`, `MM-YYYY`, `MES YYYY`) sobre o nome do arquivo.

3. **Em `processPage`**, calcular competência como:
   ```ts
   const competencia =
     extractPeriodo(ocr) ??
     extractPeriodoFromFilename(batch.original_filename ?? "");
   ```
   Assim, quando o OCR falhar (documento com layout atípico), o nome do arquivo garante a competência.

4. **Sanidade no regex `r2` (nome do mês)**: aumentar a janela `[^\d]{0,10}` para `[^\d]{0,15}` para tolerar `"Junho de 2026"` com espaços extras/pontuação do OCR.

### B. Nada muda no frontend
`BulkReviewInline` já mostra o campo Competência editável — a correção apenas garante que ele venha preenchido automaticamente na maioria dos casos.

## Fora de escopo
- Rechamar OCR em lotes já processados (usuário pode editar manualmente ou reprocessar o lote).
- Detectar competência via layout/coordenadas do PDF.

## Arquivos alterados
- `supabase/functions/dp-doc-bulk-ingest/index.ts` (apenas `extractPeriodo`, novo helper de filename, uso no `processPage`).
