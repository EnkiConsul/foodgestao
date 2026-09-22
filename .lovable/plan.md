# Comprovante de pagamento da Hanna: por que não aparece e como resolver

## O que a conferência no banco mostrou

A Hanna tem 12 documentos. Apenas **um** tem comprovante anexado:

- **Contracheque Mensal — competência 08/2026** (anexado em 17/09, arquivo `IMG-20260915-WA0020.jpg`, sem data de pagamento informada).

O documento aberto no celular na tela enviada é **Adiantamento Salarial — competência 09/2026**, que realmente não tem comprovante. Por isso a etiqueta "Sem comprovante" está correta ali: o comprovante está em outro documento da lista, e hoje nada na lista indica em qual.

## O que vai ser feito

1. **Mostrar na lista quais documentos têm comprovante**
   - Etiqueta "Comprovante" visível também nos cards do celular (hoje só existe um ícone discreto, fácil de não notar).
   - Filtro rápido "Com comprovante / Sem comprovante" no histórico de documentos, para achar o documento certo sem abrir um por um.

2. **Deixar claro onde procurar quando o documento não tem comprovante**
   - No bloco "Sem comprovante", avisar quando o mesmo colaborador tem comprovante em outro documento, com atalho para abri-lo.

3. **Conferir a abertura no celular**
   - Validar, no celular, que o comprovante do contracheque de 08/2026 abre dentro da própria tela (visualizador interno) e baixa corretamente, tanto para o gestor quanto no portal da Hanna.

4. **Nada muda nos dados**
   - Nenhum comprovante, documento ou histórico será alterado, apagado ou movido.

## Observação sobre a data de pagamento

O comprovante do contracheque de 08/2026 está sem a data do pagamento. Depois do ajuste, basta abrir o documento e usar "Substituir" para informar a data — ou eu deixo assim, como está.

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx`: já traz `comprovante_file_path` (`tem_comprovante`); adicionar filtro e rótulo nos cards mobile.
- `src/components/dp/documentos/ComprovantePagamentoPanel.tsx`: no estado sem comprovante, buscar (por colaborador) documentos com `comprovante_file_path` e oferecer atalho.
- `src/pages/dp/portal/DpMeuDocumentos.tsx`: mesma sinalização no portal, somente leitura.
- Sem migrations, sem alteração de RLS, sem publicação.
