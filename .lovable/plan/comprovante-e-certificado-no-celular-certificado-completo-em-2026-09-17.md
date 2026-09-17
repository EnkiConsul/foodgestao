# Comprovante e certificado no celular + certificado completo em PDF

## O que está acontecendo hoje

- O comprovante de pagamento e o certificado de validação abrem sempre em **uma aba nova** do navegador. No celular (e no aplicativo instalado) essa aba é bloqueada, então a pessoa toca no botão e nada aparece.
- O certificado é gerado como uma página só, com os dados da aprovação. Ele **não** traz o documento assinado, não repete a identificação em todas as páginas e não inclui o comprovante de pagamento.

## O que vai mudar

### 1. Ver o comprovante no celular
O botão "Comprovante de pagamento" passa a abrir o comprovante **dentro do próprio aplicativo**, na mesma janela de visualização já usada nos outros documentos (com Baixar e Abrir em nova aba dentro dela). Vale no portal do colaborador e nas telas do setor de pessoas — lista, card e detalhes do documento.

### 2. Ver o certificado no celular
O certificado deixa de depender de aba nova: abre na mesma janela de visualização, com os botões Baixar e Imprimir. Quem estiver no computador continua podendo abrir em outra aba.

### 3. Certificado com o documento assinado
O certificado passa a ser um **PDF único**, montado no servidor, com:

```text
Página 1  Certificado de validação (empresa, colaborador, documento,
          data/hora, quem aprovou, IP, dispositivo, código do registro,
          impressão digital do conteúdo)
Página 2+ O documento que foi assinado, página por página
Final     Anexo: comprovante de pagamento (quando existir)
```

- Em **todas as páginas** aparece um rodapé com: nome da empresa, colaborador, documento, data e hora da aprovação, código do registro, trecho da impressão digital e "Página X de Y".
- O comprovante de pagamento entra como anexo mesmo sem ter assinatura própria, identificado como "Anexo — Comprovante de pagamento (sem validação digital)".
- Quando o documento (ou o comprovante) for uma foto/imagem, ela entra como página do PDF; quando for um formato que não dá para juntar, o certificado sai com um aviso claro de que o arquivo original está guardado e segue disponível para download.

## Detalhes técnicos

- Nova função de servidor `dp-documento-certificado`: valida a sessão, confirma pelo banco que a pessoa pode ver aquele documento (mesma regra de `dp_documento_arquivo`), lê o registro de aceite em `dp_documento_aceites`, baixa documento e comprovante do bucket privado `dp-documentos` e devolve o PDF final. Nenhum caminho de Storage é montado no cliente.
- Montagem com `pdf-lib` (já usado em `dp-generate-disciplinary-pdf`): página do certificado desenhada com fonte padrão, `copyPages` para as páginas do documento/comprovante em PDF, `embedJpg`/`embedPng` para imagens, rodapé desenhado em cada página no fim, e o comprovante também anexado ao PDF (`attach`) além de virar páginas visíveis.
- `src/lib/dp/documento-certificado.ts` mantém o HTML atual como alternativa, e ganha `baixarCertificadoValidacao(documentoId)` que chama a função e devolve um Blob PDF; os testes existentes do HTML continuam valendo.
- Visualização: reaproveitar `DocumentPreview` recebendo `url` (Blob URL do PDF ou link assinado do comprovante), em vez de `window.open`/`<a target="_blank">`. Ajustes em `DpMeuDocumentos.tsx`, `DocDetalhesDialog.tsx` e `ComprovantePagamentoPanel.tsx` (inclui `ComprovanteAcaoBotao`).
- Fail closed: sem aceite registrado, sem vínculo ou sem permissão, a função devolve erro genérico em PT-BR e nada é gerado. Sem migration; nenhum arquivo existente é alterado ou apagado.
- Verificação enxuta: typecheck, lint dos arquivos alterados, testes já existentes do certificado e uma passagem no navegador em 390x844 e no desktop.
