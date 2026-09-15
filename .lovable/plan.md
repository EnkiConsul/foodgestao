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
4. O comprovante não exige aceite do colaborador — a validação digital continua sendo apenas do documento principal.

## Comprovante anexado dias depois

O comprovante quase nunca chega junto do documento, então ele é tratado como uma etapa própria:

- Assim que um documento de pagamento é importado sem comprovante, ele entra na lista de pendências como "Comprovante de pagamento em falta", com o colaborador, o tipo e a competência.
- A pendência só vira atraso depois do prazo configurado (padrão: 5 dias após a data do documento ou da data de pagamento, quando informada). Antes disso aparece como pendência normal, sem alarme.
- Ao anexar o comprovante, a pendência baixa na hora, com registro de quem anexou e quando.
- Nas Configurações → Prazos de Pendências a empresa pode desligar essa cobrança ("Exigir comprovante de pagamento") e ajustar o prazo em dias. Por padrão vem **ligada** para todos os tipos de pagamento.
- Documento arquivado ou substituído não cobra comprovante; ao substituir o documento, o comprovante existente é mantido e sinalizado como "referente à versão anterior" nos detalhes.
- A cobrança vale apenas para documentos com competência a partir de 01/09/2026. Documentos anteriores continuam aceitando comprovante quando a empresa quiser anexar, mas nunca geram pendência. A data de corte fica configurável (padrão 01/09/2026), para o caso de a empresa querer começar depois.

## Detalhes técnicos

**Banco (uma migration)**
- Novas colunas em `dp_documentos`: `comprovante_file_path`, `comprovante_file_name`, `comprovante_file_size`, `comprovante_mime_type`, `comprovante_pago_em` (date), `comprovante_uploaded_by`, `comprovante_uploaded_at`.
- Sem alteração nas policies existentes: o comprovante herda a visibilidade da própria linha (admin/owner/super_admin escrevem; colaborador titular lê, exceto tipo `disciplinar`). Somente as policies de admin permitem escrita, então o portal não consegue gravar comprovante.
- Trigger `BEFORE INSERT OR UPDATE` fail-closed: rejeita comprovante em tipos fora da allowlist e impede que o colaborador (caminho `dp_doc_colab_submit`) preencha as colunas de comprovante.
- `dp_documento_arquivo` ganha parâmetro `_variante text default 'documento'`; com `'comprovante'` devolve o caminho do comprovante usando exatamente a mesma checagem de autorização. Chamadas atuais continuam funcionando.
- Contadores/auditoria já cobertos pelos triggers atuais (`audit_row_change`, `dp_set_updated_at`).
- `dp_pendencias_config`: novas colunas `exigir_comprovante_pagamento boolean not null default true`, `alerta_comprovante_dias int not null default 5` e `comprovante_vigencia_inicio date not null default '2026-09-01'`.
- Geração de pendências (`dp_pendencias_*` / função de materialização + `src/lib/dp/pendencias.ts`): novo tipo `comprovante_pagamento` para documentos ativos de tipo na allowlist, sem `comprovante_file_path` e com `referencia_data >= comprovante_vigencia_inicio` (documentos sem competência usam `created_at`); atrasado quando `hoje > referencia_data + alerta_comprovante_dias`.

**Storage**
- Mesmo bucket privado `dp-documentos`, prefixo `comprovantes/{company_id}/{colaborador_id}/…`. Upload sem `upsert`; ao substituir, o arquivo anterior é removido depois de a linha ser atualizada.

**Frontend**
- `src/lib/documentoArquivo.ts`: `arquivoAutorizado(id, variante)` e `abrirDocumento(id, { variante })`.
- `src/lib/dp/documentoTipos.ts`: allowlist `TIPOS_COM_COMPROVANTE` compartilhada com a trigger.
- Novo componente `src/components/dp/documentos/ComprovantePagamentoPanel.tsx` usado no `DocDetalhesDialog`; mutations em `useDpDocumentos` (anexar/substituir/remover).
- Botão-atalho `ComprovanteAcaoBotao` reaproveitando as mesmas mutations, renderizado no card/linha da lista em `DpHistoricoCompleto` e no `ColaboradorDocumentosPanel` (input de arquivo oculto, feedback por toast).
- `src/hooks/portal/useMeusDocumentos.tsx` passa a trazer `comprovante_file_name`/`comprovante_pago_em` e a tela `DpMeuDocumentos` mostra o botão de comprovante.
- `useDpPendenciasConfig` + `DpCadastroPendencias`: switch "Exigir comprovante de pagamento" (padrão ligado) e campo de prazo em dias; `resolverPendencias`/`porDocumento` baixam a pendência ao anexar.
- Textos de cadastro em CAIXA ALTA não se aplicam aqui; rótulos em Primeira Maiúscula.

**Testes**
- Teste RLS: colaborador de outra empresa não lê comprovante; colaborador titular lê; portal não grava comprovante.
- Teste da trigger: comprovante recusado em tipo fora da allowlist.
- Teste de componente (fireEvent) do painel e do atalho no card.
- Teste unitário das pendências: gera com a opção ligada, não gera com ela desligada, marca atraso após o prazo e baixa ao anexar.

**Rollback**
- Migration de reversão remove as colunas, a trigger e restaura a assinatura anterior de `dp_documento_arquivo`; arquivos ficam órfãos no bucket e podem ser apagados por rotina manual.
