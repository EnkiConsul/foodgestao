# Conferência no topo e atalho direto para importar

## O que muda

1. **Conferência de Documentos volta para o topo da tela de Importar.**
   Como no celular ela já começa recolhida (mostrando só o título e a contagem de pontos de atenção), ela deixa de empurrar o envio do PDF para baixo. No computador continua aberta por padrão.

2. **Clicar num item pendente leva direto ao envio.**
   Cada linha de "Falta Importar" (e de "Inconsistência de Cadastro") passa a ser clicável, com um botão "Importar este". Ao clicar:
   - a natureza do documento (contracheque, ponto, adiantamento…) e a competência já ficam preenchidas no formulário de envio;
   - a tela rola suavemente até o campo de escolher o arquivo;
   - no celular, o quadro de conferência se recolhe sozinho para o envio ficar visível.

## Detalhes técnicos

- `src/pages/dp/DpDocumentosImportar.tsx`
  - Reordena: `DocConsistenciaPanel` antes de `BulkImportPanel`.
  - Passa a guardar o foco de importação em estado (`{ tipo, competencia, nonce }`), inicializado pelos parâmetros da URL (`tipo`, `competencia`, `lote`) já existentes, e repassa para o painel de envio.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`
  - Nova prop opcional `onImportar?: (tipo: string, competencia: string) => void`.
  - `renderGrupo` ganha um botão "Importar este" quando `onImportar` existe; o botão fica fora do `CollapsibleTrigger`, sem botão dentro de botão.
  - Quando `onImportar` é acionado no celular, o painel se recolhe (`setAbertaManual(false)`).
- `src/components/dp/documentos/BulkImportPanel.tsx`
  - Novas props `tipoSugerido`/`referenciaSugerida` + `focoNonce?: number`. Um efeito observa `focoNonce`: aplica tipo/referência no formulário e chama o `rolarAte(uploadCardRef.current)` que já existe.
  - `tipoInicial`/`referenciaInicial` seguem funcionando como hoje (sem regressão para os links de "Resolver" vindos das pendências).
- Sem mudanças de banco, RLS, permissões, motor de leitura de PDF ou regras de conferência.

## Verificação

- Typecheck e a suíte de testes de DP.
- Conferência visual em 360 px e 1366 px: conferência no topo recolhida/aberta, clique num pendente preenchendo o formulário e rolando até o envio, sem rolagem horizontal.
