# Aviso fixo "Importando: … T-63" na tela de Importar

## Por que aparece

Esse aviso não é uma notificação do sistema: é a "lembrança" do atalho que você usou. Quando você clica em **Resolver** numa pendência (ou em **Importar este** na Conferência), a tela de Importar é aberta já com o tipo, a competência e a unidade escolhidos — e o aviso serve para mostrar o que está sendo importado, além de pré-preencher o formulário.

O problema é que essa informação fica gravada no endereço da tela. Então:

- fechar o aviso no "x" só o esconde naquele momento; ao voltar para Importar (pela barra de baixo, pelo Histórico ou recarregando a página) ele volta;
- depois de concluir a importação daquele documento o aviso continua lá, dando a impressão de algo pendente;
- no seu caso ele mostra "Contracheque Mensal · junho/2026 · Pakerê T-63", que foi o último atalho aberto.

## O que vou corrigir

- Fechar no "x" passa a apagar de verdade o contexto do atalho: o aviso não volta mais e o formulário fica limpo para um novo envio.
- Ao concluir a importação daquele tipo/competência, o aviso desaparece sozinho.
- O aviso ganha texto mais claro e um atalho: "Você veio da pendência X. Preenchemos o formulário abaixo." com botão **Limpar**.
- Se a competência indicada já estiver importada para aquela unidade, o aviso não aparece.

Nada muda na leitura dos PDFs, na classificação dos documentos, nas pendências ou nas permissões.

## Detalhes técnicos

- `src/pages/dp/DpDocumentosImportar.tsx`: usar a forma de escrita de `useSearchParams` para remover `tipo`, `competencia`, `unidade` e `lote` da URL (com `replace: true`) ao fechar o aviso, em vez do estado local `avisoAberto`; manter `tipoInicial`/`referenciaInicial` num estado inicializado a partir da URL para que o pré-preenchimento sobreviva à limpeza.
- Passar um `onConcluido`/callback do `BulkImportPanel` para a página, limpando os parâmetros quando o lote correspondente é concluído.
- Ajustar o texto do `Alert` e adicionar o botão "Limpar" ao lado do "x".
- Sem migrations, sem alterações em edge functions, RLS ou multiempresa.

## Verificação

- Typecheck e testes de `src/lib/dp` / `src/hooks`.
- Playwright em 360 px: abrir `/dp/documentos?tipo=contracheque&competencia=2026-06&unidade=<id>`, conferir o aviso, fechar e recarregar — o aviso não deve voltar.

## Rollback

- Reverter o arquivo alterado; nenhum dado envolvido.
