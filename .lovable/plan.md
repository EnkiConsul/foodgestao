# Tipos de documento: um só de Admissão e um só de Desligamento

## O que muda para quem usa

Ao enviar um documento, no lugar de escolher entre Contrato, Ficha de Registro, Termos e "Outros (Admissão)", existe um único tipo **Admissão** — nele cabem contrato, ficha de registro, ASO admissional, termos e o que mais vier da admissão.

Do mesmo lado, no lugar de Aviso Prévio, TRCT, Demonstrativo Rescisório e "Outros (Desligamento)", passa a existir um único tipo **Desligamento** — com TRCT, ASO demissional, ficha, aviso prévio e demais.

Os outros tipos continuam como estão: contracheque, adiantamento, pró-labore, 13º, férias, ponto, banco de horas, atestado, disciplinar, informe de rendimentos, sindical e outros.

Regras que seguem valendo:

- Documentos de Admissão e de Desligamento pedem aceite eletrônico do colaborador, como o contrato já pedia.
- O título que a pessoa escreve no envio continua aparecendo, então "ASO admissional" ou "TRCT" seguem identificáveis na lista.
- Documentos de Desligamento continuam aceitando comprovante de pagamento anexado (caso do TRCT).
- Documentos já enviados com os tipos antigos passam a constar como Admissão ou Desligamento, sem perder arquivo, versões, aceites nem histórico. Hoje não existe nenhum documento gravado nesses tipos antigos, então na prática a reclassificação não altera nada do que está na tela.
- Filtros, barra de naturezas e importação em massa passam a mostrar só os dois tipos unificados nesses dois grupos.

## Detalhes técnicos

1. **Banco (migration reversível)**
   - Acrescentar o valor `desligamento` ao enum `dp_documento_tipo` (o valor `admissao` já existe).
   - Reclassificar `public.dp_documentos`: `contrato`, `ficha_registro`, `termos`, `outros_admissao` → `admissao`; `aviso_previo`, `trct`, `demonstrativo_rescisorio`, `outros_desligamento` → `desligamento`. Contagem atual nesses tipos: 0 — a migration roda idempotente e registra o antes/depois.
   - Atualizar `public.dp_documento_aceita_comprovante` para incluir `desligamento` (mantendo os tipos antigos aceitos, para não quebrar histórico).
   - Valores antigos do enum permanecem declarados (Postgres não remove valor de enum), apenas deixam de ser oferecidos.

2. **Catálogo do frontend** — `src/lib/dp/documentoTipos.ts`
   - Substituir as quatro entradas do grupo `admissao` por uma única `admissao` ("Admissão", `exigeAceite: true`, palavras-chave somadas: contrato de trabalho, ficha de registro, ASO admissional, exame admissional, termo de...) e as quatro do grupo `desligamento` por uma única `desligamento` ("Desligamento", palavras-chave: TRCT, termo de rescisão, aviso prévio, demonstrativo rescisório, ASO demissional, exame demissional).
   - Manter os valores antigos num mapa de compatibilidade (`DP_DOC_TIPOS_LEGADOS`) com `importavel: false`, para que qualquer registro histórico ainda tenha rótulo e cor.
   - `detectarTipoDocumento` passa a devolver os dois tipos unificados; `TIPOS_COM_COMPROVANTE` ganha `desligamento`.

3. **Espelho nas Edge Functions** — `supabase/functions/_shared/doc-tipos.ts` recebe as mesmas mudanças; `dp-doc-bulk-approve` e `bulk-coverage.ts` passam a tratar `desligamento` no lugar da lista de tipos rescisórios (aceitando também os antigos).

4. **Telas** — filtros e listas que citam tipos antigos: `DpMeuDocumentos.tsx` (aba "Contratos" vira "Admissão" e ganha "Desligamento"), `DocConsistenciaPanel.tsx`, `useDpFichaImportacao.tsx`, `useMeusDocumentos.tsx`, `useDocumentosAguardandoAssinatura.tsx`.

5. **Provas e testes** — reclassificação conferida em transação desfeita antes de valer; testes de documentos, comprovante, cobertura e consistência atualizados; `bunx vitest run` e verificação de tipos. Publicação só se você pedir.
