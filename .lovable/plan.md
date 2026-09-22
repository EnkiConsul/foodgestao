# Importar documentos: botão para anexar mais arquivos

Na tela de importação de documentos é possível enviar vários PDFs de uma vez, mas depois de escolher o primeiro arquivo a área passa a mostrar só os nomes e o aviso "Limpar seleção" — não há nada que indique que dá para acrescentar mais. Quem já anexou um arquivo acha que precisa começar de novo.

## O que muda

1. **Botão "Anexar Mais Arquivos"**: aparece logo abaixo da lista de arquivos escolhidos, sempre visível enquanto houver pelo menos um arquivo. Ao clicar, abre novamente a escolha de arquivos e os novos somam aos já escolhidos (arquivo repetido não entra duas vezes).
2. **Remover um arquivo da lista**: cada arquivo passa a ter um "x" ao lado do nome, para tirar só aquele sem perder os outros. O "Limpar seleção" continua existindo para tirar todos.
3. **Contagem clara**: o texto continua mostrando quantos arquivos estão prontos para processar e o limite de páginas por lote.
4. Arrastar e soltar continua funcionando e também soma aos arquivos já escolhidos.

Nenhuma regra de importação, leitura por IA, tipo de documento ou vínculo com colaborador muda.

## Detalhes técnicos

- Alteração restrita a `src/components/dp/documentos/BulkImportPanel.tsx`: a área de arrastar deixa de ser um `<label>` que engole os cliques dos botões internos; o `<input type="file" multiple>` ganha uma referência e a área abre o seletor por clique próprio, com acessibilidade por teclado (role/`onKeyDown` em Enter e Espaço).
- `pickFiles` já acumula e desduplica por nome+tamanho — mantido como está. Nova função `removerArquivo(chave)` para o "x" de cada item.
- Sem mudanças no banco, no Storage, nas Edge Functions nem no fluxo de lote.
- Validação: `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json`, ESLint e conferência no navegador anexando dois PDFs em sequência. Nada é publicado.
