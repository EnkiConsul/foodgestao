# Comprovante de pagamento anexado ao documento

Cada documento de pagamento passa a aceitar um segundo arquivo: o comprovante de pagamento. O colaborador vê o documento e, quando existir, também o comprovante.

## Onde vale

Tipos que aceitam comprovante:

- Contracheque (mensal), 13º e férias
- Recibo e aviso de férias
- Adiantamento salarial
- Rescisão (TRCT e demonstrativo rescisório)
- PLR, pró-labore e outros pagamentos

Nos demais tipos (identidade, atestado, disciplinar, etc.) o campo não aparece.

## Como funciona

1. Na tela de Documentos, ao abrir os detalhes de um documento de pagamento aparece um bloco "Comprovante de Pagamento" com:
   - anexar arquivo (PDF ou imagem), com data do pagamento opcional;
   - ver e baixar o comprovante já anexado;
   - substituir ou remover, com registro de quem fez e quando.
2. No card de cada documento de pagamento há um atalho direto: "Anexar comprovante" quando não houver anexo e "Comprovante" (ver/baixar) quando já houver, sem precisar abrir os detalhes. Um selo discreto indica que o documento já tem comprovante.
3. No portal do colaborador, o documento de pagamento passa a mostrar, junto do botão de ver o documento, um botão "Comprovante" quando houver anexo. O colaborador apenas visualiza e baixa; não anexa nem remove.
4. O comprovante não exige aceite nem cria pendência — a validação digital continua sendo apenas do documento principal.

## Detalhes técnicos

**Banco (uma migration)**
- Novas colunas em `dp_documentos`: `comprovante_file_path`, `comprovante_file_name`, `comprovante_file_size`, `comprovante_mime_type`, `comprovante_pago_em` (date), `comprovante_uploaded_by`, `comprovante_uploaded_at`.
- Sem alteração nas policies existentes: o comprovante herda a visibilidade da própria linha (admin/owner/super_admin escrevem; colaborador titular lê, exceto tipo `disciplinar`). Somente as policies de admin permitem escrita, então o portal não consegue gravar comprovante.
- Trigger `BEFORE INSERT OR UPDATE` fail-closed: rejeita comprovante em tipos fora da allowlist e impede que o colaborador (caminho `dp_doc_colab_submit`) preencha as colunas de comprovante.
- `dp_documento_arquivo` ganha parâmetro `_variante text default 'documento'`; com `'comprovante'` devolve o caminho do comprovante usando exatamente a mesma checagem de autorização. Chamadas atuais continuam funcionando.
- Contadores/auditoria já cobertos pelos triggers atuais (`audit_row_change`, `dp_set_updated_at`).

**Storage**
- Mesmo bucket privado `dp-documentos`, prefixo `comprovantes/{company_id}/{colaborador_id}/…`. Upload sem `upsert`; ao substituir, o arquivo anterior é removido depois de a linha ser atualizada.

**Frontend**
- `src/lib/documentoArquivo.ts`: `arquivoAutorizado(id, variante)` e `abrirDocumento(id, { variante })`.
- `src/lib/dp/documentoTipos.ts`: allowlist `TIPOS_COM_COMPROVANTE` compartilhada com a trigger.
- Novo componente `src/components/dp/documentos/ComprovantePagamentoPanel.tsx` usado no `DocDetalhesDialog`; mutations em `useDpDocumentos` (anexar/substituir/remover).
- Botão-atalho `ComprovanteAcaoBotao` reaproveitando as mesmas mutations, renderizado no card/linha da lista em `DpHistoricoCompleto` e no `ColaboradorDocumentosPanel` (input de arquivo oculto, feedback por toast).
- `src/hooks/portal/useMeusDocumentos.tsx` passa a trazer `comprovante_file_name`/`comprovante_pago_em` e a tela `DpMeuDocumentos` mostra o botão de comprovante.
- Textos de cadastro em CAIXA ALTA não se aplicam aqui; rótulos em Primeira Maiúscula.

**Testes**
- Teste RLS: colaborador de outra empresa não lê comprovante; colaborador titular lê; portal não grava comprovante.
- Teste da trigger: comprovante recusado em tipo fora da allowlist.
- Teste de componente (fireEvent) do painel de comprovante.

**Rollback**
- Migration de reversão remove as colunas, a trigger e restaura a assinatura anterior de `dp_documento_arquivo`; arquivos ficam órfãos no bucket e podem ser apagados por rotina manual.
