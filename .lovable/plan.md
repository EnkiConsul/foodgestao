# Documentos: só anexar (contrato, ficha e ASO), com aceite opcional

Ajuste do módulo de documentos de admissão para tirar a geração automática de documentos pelo sistema e permitir vários anexos no item de contrato.

## O que muda

1. **Contrato de trabalho** passa a ser um item de **anexo**, sem geração pelo sistema.
   - Permite **vários arquivos no mesmo item** (contrato, ficha de registro, termos aditivos, outros termos), sem campos separados.
   - Botão **"Enviar para aceite do colaborador"** continua disponível, mas **opcional**: o DP escolhe um dos anexos e envia; o item fica aprovado mesmo sem aceite.
   - O aceite pelo portal continua registrando data/hora, IP, user agent e hash do arquivo.

2. **Ficha de registro de empregado**: deixa de ser requisito próprio (é absorvida pelo item de contrato). O requisito semeado passa a `desativado` para não gerar pendência; empresas que quiserem separar podem reativá-lo na tela de documentos exigidos, agora como anexo simples.

3. **ASO admissional**: deixa de ser "gerado/satisfeito por outro módulo" e passa a ser **anexo obrigatório** normal na ficha. O registro de exames do SESMT continua existindo à parte, sem interferir na pendência.

4. **Termo de ciência de jornada e banco de horas**: removido do catálogo padrão (`desativado`), já que o texto está no contrato feito pela contabilidade.

## Telas

- **Ficha do colaborador › Documentos**: o item Contrato mostra a lista de anexos com "Adicionar arquivo", visualizar, baixar e excluir por arquivo; ação "Enviar para aceite" ao lado, com badge de aceite quando houver.
- **Portal do colaborador**: mesmo comportamento (envia vários arquivos); aceite aparece só quando o DP tiver enviado algo para aceite.
- **Documentos exigidos da empresa**: sai a coluna/flag "gerado pelo sistema"; entra "permite vários arquivos" e "pode pedir aceite".

## Detalhes técnicos

Migração:
- `dp_documento_requisitos`: nova coluna `permite_multiplos boolean NOT NULL DEFAULT false`; `gerado_pelo_sistema` deixa de ser usado (mantido, sempre `false`); `exige_aceite` passa a significar "aceite disponível/opcional".
- Substituir o índice único `dp_colab_doc_uk` por um que aceite múltiplas linhas quando o requisito permitir vários arquivos (único por `requisito_id, colaborador_id, dependente_id, documento_id`), preservando a unicidade lógica dos itens single-file por validação no app.
- Atualizar `dp_documento_requisitos_seed`: contrato (`permite_multiplos = true`, `gerado_pelo_sistema = false`, `exige_aceite = true`), `ficha_registro` e `termo_jornada` como `desativado`, `aso_admissional` com `satisfeito_por = NULL`.
- Migração de dados para empresas já semeadas: aplicar os mesmos valores nos requisitos `sistema = true` existentes.

Front-end:
- `src/lib/dp/documentos-requisitos.ts`: remover o caminho `satisfeito_por = 'aso_admissional'` da resolução de status e suportar item com N anexos (status agregado: pendente se nenhum aprovado).
- `src/hooks/useDpColaboradorDocumentos.tsx`: remover `gerarDocumento` (geração de contrato/ficha), manter upload/aprovação, permitir múltiplos anexos por requisito e um mutation "enviar anexo para aceite".
- `src/components/dp/documentos/DocumentoRequisitoRow.tsx` e `ColaboradorDocumentosPanel.tsx`: lista de anexos por item e ação de aceite opcional.
- `src/lib/dp/contratoTemplate.ts`: deixa de ser usado no fluxo (removido junto com o dialog de geração), mantendo apenas o `hashConteudo` usado no aceite.
- `src/pages/dp/cadastros/DpDocumentosExigidos.tsx`: campos "permite vários arquivos" e "pode pedir aceite".
- Pendências (`useDpPendencias`, `useDpPendenciasColaborador`): contrato sem aceite não gera pendência; ASO sem anexo gera pendência de documento.
- Atualizar testes em `src/lib/dp/__tests__/` e a memória `mem://features/documentos-admissao`.
