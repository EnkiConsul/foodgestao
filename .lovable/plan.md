## Diagnóstico (confirmado nos dados)

No OCR da página 6 (Karine, cartão de ponto) o rótulo "Período de referência" se perde na leitura colunar. O texto contém `07/05/2026` (data de admissão, sem rótulo) **antes** de `01/06/2026 à 30/06/2026`. A regra 3 de `extractPeriodo` (`supabase/functions/dp-doc-bulk-ingest/index.ts`) casa `MM/AAAA` solto dentro de `07/05/2026` → competência errada **05/2026**. No holerite do mesmo mês o texto traz "Junho de 2026" e a detecção acertou.

## Parte 1 — Corrigir a detecção de competência (todos os tipos)

`extractPeriodo` é única e usada por qualquer lote, então a correção já vale para **contracheque, ponto, adiantamento** e para o futuro **décimo terceiro**. Ajustes:

1. **Nova regra de maior prioridade — intervalo de datas**: `DD/MM/AAAA` a/à/até/`-` `DD/MM/AAAA`. Meses iguais → esse mês; diferentes → mês da data inicial. Cobre "de 01/06/2026 à 30/06/2026" sem rótulo.
2. Manter rótulo + `MM/AAAA` e nome do mês + ano, ampliando os rótulos ("período de referência", "competência", "folha mensal", "adiantamento referente a", "13º/décimo terceiro").
3. **Endurecer o fallback solto**: ignorar `MM/AAAA` que faz parte de uma data completa `DD/MM/AAAA` e ignorar ocorrências próximas de "admissão", "emissão", "impressão", "nascimento", "cadastro", "pagamento em".
4. **Desempate por frequência**: contar datas de linha (`01/06`, `02/06`, …) e usar o mês/ano majoritário — útil no ponto e em adiantamentos com tabela de dias.
5. Prompt do OCR passa a pedir uma linha final explícita `COMPETENCIA: MM/AAAA` (período do documento, nunca emissão/admissão), usada como fonte prioritária quando presente.

Extrair essa lógica para um módulo compartilhado testável e cobrir com testes unitários usando os trechos reais de OCR de contracheque e de ponto, mais casos de adiantamento e 13º.

## Parte 2 — Sinalizar colaboradores faltantes no lote (todos os tipos)

Adicionar painel **"Colaboradores sem documento neste lote"** na revisão (`BulkReviewInline.tsx`, com paridade em `BulkReviewDialog.tsx`), válido para qualquer `tipo` de lote.

Esperado calculado no cliente a partir dos colaboradores já carregados:
- mesma empresa e, quando o lote identificou unidade pelo CNPJ das páginas, mesma unidade;
- filtro por tipo: `ponto` exige `possui_folha_ponto`; contracheque/adiantamento/13º consideram todos os colaboradores elegíveis;
- **ativo no período**: `data_admissao` ≤ último dia da competência e (`data_desligamento` nulo ou ≥ primeiro dia da competência) — inclui desligados no meio do mês, exclui admitidos depois.

O painel mostra "X de Y colaboradores com documento", lista os faltantes (nome, matrícula, unidade) e exibe alerta âmbar. Não bloqueia a aprovação: apenas pede confirmação antes de aprovar quando houver faltantes.

## Detalhes técnicos

- Backend: apenas `supabase/functions/dp-doc-bulk-ingest/index.ts` (parsing + prompt). Sem migração de banco.
- A competência-base da conferência é a predominante entre os itens do lote, com fallback para `referencia_data` do lote.
- Décimo terceiro: quando o tipo for criado no enum `dp_documento_tipo`, ele já cai nas mesmas regras — o único ajuste futuro será tratar parcelas (1ª/2ª) na exibição.
- Documentos já importados com competência errada não são corrigidos retroativamente; a competência segue editável na revisão.
