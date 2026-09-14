# Revisão final da auditoria Gestor x Colaborador

Revisei a lista aprovada item por item. Todas as fases (1 a 6) estão entregues, com duas exceções pequenas que ficaram parciais dentro da Fase 6.

## O que está fechado

- Fase 1 — avisos de falha de internet com "Tentar de novo" e formas de carregamento em todas as telas do portal.
- Fase 2 — confirmação antes de cancelar envio de documento e de remover folga; sino do portal sem filas do gestor.
- Fase 3 — selos de situação com as mesmas cores do administrativo; todas as janelas rolam no celular.
- Fase 4 — botões Cancelar/Enviar sempre visíveis nos formulários longos; busca no Meu Histórico.
- Fase 5 — leitura por leitores de tela no menu de baixo; telas antigas de ponto e contracheque removidas.
- Fase 6 — lista da tela inicial com altura adaptada ao celular; atalhos favoritos na tela inicial; "Baixar meus dados" no Meu Histórico.

## O que ficou parcial

1. **Exportar meus documentos.** O plano previa exportar histórico *e* documentos. Hoje só o Meu Histórico tem o botão de baixar. Falta o mesmo botão em Meus Documentos, com data, tipo, título, situação e validade do que está na tela (respeitando busca e filtro).
2. **Paginação do Histórico.** O plano dizia "usar a paginação do gestor" (páginas numeradas com Anterior/Próxima). O portal continua com o botão "Carregar mais". Funciona, mas não é o mesmo formato do lado do gestor.

## Proposta

- Adicionar o botão "Baixar meus dados" em Meus Documentos, no mesmo formato do Histórico.
- Manter o "Carregar mais" no Histórico: em celular ele é mais confortável que páginas numeradas e a lista do colaborador é curta. Se preferir igualar ao gestor, troco por páginas numeradas.

## Detalhes técnicos

- Reusar `baixarCsv` de `src/lib/dp/portal-csv.ts` (separador ";" e BOM UTF-8).
- Em `DpMeuDocumentos.tsx`, exportar a lista já filtrada em memória; nenhuma consulta nova, nenhuma mudança de banco ou permissão.
- Validar com `bunx tsgo --noEmit` e `bunx vitest run`.
