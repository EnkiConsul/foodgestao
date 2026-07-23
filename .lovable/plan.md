Plano de correção

1. Corrigir o vínculo automático da competência
- Padronizar a competência detectada por página como mês (`YYYY-MM`) na revisão.
- Trocar os campos de competência da revisão inline e tela cheia de `date` para `month`, porque hoje o valor detectado (`YYYY-MM`) não aparece em um input de data completa.
- Na aprovação, gravar `dp_documentos.referencia_data` usando a competência do item (`detected_competencia + '-01'`) antes de usar o fallback do lote (`referencia_data`).
- Ajustar a verificação de duplicidade para usar a competência por página, garantindo que contracheque/ponto/adiantamento de “Junho de 2026” seja salvo como `2026-06-01`.
- Fortalecer a extração na função de OCR para aceitar variações comuns: `Junho de 2026`, `JUNHO/2026`, `06/2026`, `06.2026`, `Competência: Junho 2026`, `Referência: 06-2026` e mês/ano no nome do arquivo.

2. Melhorar a visualização da competência detectada
- Mostrar a competência detectada no painel de revisão como `06/2026` quando existir.
- Manter edição manual por página para casos em que o OCR não encontrar a competência.
- Ao selecionar manualmente a competência, salvar no item no mesmo padrão (`YYYY-MM`) para a aprovação usar corretamente.

3. Não manter lotes não aprovados como histórico permanente
- Tratar `dp_bulk_import_batches` e `dp_bulk_import_items` como área temporária de revisão, não como documento final.
- Adicionar ação visível “Descartar lote” nos lotes que ainda não foram aprovados/importados.
- Ao descartar, remover:
  - itens do lote;
  - registro do lote;
  - arquivos temporários no bucket de importação (`source.pdf` e páginas separadas).
- Após aprovar e salvar documentos, limpar automaticamente os arquivos temporários do lote aprovado, preservando apenas os documentos finais em `dp_documentos`.

4. Limpeza automática de lotes abandonados
- Criar rotina segura no backend para apagar lotes temporários sem nenhum documento importado após um período curto de abandono.
- Critério sugerido: remover lotes `ready`, `failed` ou `processing` antigos sem itens importados, junto com arquivos temporários.
- Isso evita que importações que o usuário não concluiu continuem aparecendo em “Lotes recentes”.

5. Ajustes de lista e UX
- Exibir em “Lotes recentes” apenas lotes em processamento/revisão recente ou com importação parcial/importada relevante.
- Para lotes temporários pendentes, deixar claro que nada foi salvo como documento final até clicar em “Aprovar e Salvar”.
- Atualizar os invalidates/refetches para a lista sumir imediatamente após descartar ou aprovar.

6. Validação
- Testar com contracheque contendo “Junho de 2026”: a página deve abrir já com competência `06/2026` preenchida.
- Aprovar o item e confirmar que o documento final fica com `referencia_data = 2026-06-01`.
- Processar um lote e descartar: o lote deve desaparecer e não deixar itens/arquivos temporários acessíveis.
- Aprovar um lote: documentos finais permanecem; staging temporário é limpo.