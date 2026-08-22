# Conferência de Competência sem filtro de mês

## Problema

O quadro "Conferência da Competência" só olha a competência escolhida no seletor. Se uma folha de ponto de um mês anterior nunca foi importada, ela desaparece do radar assim que o usuário muda o mês.

## Comportamento desejado

O painel passa a varrer várias competências de uma vez e lista tudo que está pendente, do mês mais recente para o mais antigo.

- O seletor de competência é removido; o painel sempre mostra todas as pendências da janela.
- Janela de varredura: as últimas 6 competências fechadas (mês anterior para trás), nunca antes do mês em que a empresa foi cadastrada no sistema.
- Uma competência só é considerada para um colaborador se ele já estava admitido nela e não estava desligado.
- Cada linha do quadro passa a mostrar a competência a que se refere (o badge MM/AAAA já existe e vira a informação-chave), mantendo o agrupamento atual por tipo de documento + unidade + problema.
- Ordenação: competência mais recente primeiro; dentro dela, o mesmo critério atual (falta importar antes de inconsistência, tipo, unidade).
- Título muda para "Conferência de Documentos" e um subtítulo indica a janela analisada (ex.: "Últimos 6 meses a partir de 07/2026").
- Se não houver nenhuma pendência em nenhum mês da janela, mantém a mensagem verde de tudo certo.

## Detalhes técnicos

Arquivo: `src/components/dp/documentos/DocConsistenciaPanel.tsx` (apenas frontend; sem migração, RLS ou edge function).

1. Remover o estado `competencia` e o input `type="month"`.
2. Calcular a lista de competências: começa no mês anterior ao atual e volta até 6 meses, cortando em `companies.created_at` (buscar `created_at` da empresa selecionada).
3. Consulta única de `dp_documentos` com `referencia_data` entre o primeiro dia da competência mais antiga e o último dia da mais recente; indexar por `colaborador_id::tipo::YYYY-MM`.
4. Consulta de `dp_colaboradores` passa a incluir `data_admissao` e `data_desligamento` para filtrar elegibilidade por competência.
5. Alertas e elegíveis passam a ser calculados por competência: chave de grupo vira `${competencia}-${problema}-${tipo}-${unidade_id ?? "sem-unidade"}`; "lote completo" continua sendo `pendentes === elegíveis da unidade naquela competência`.
6. Estado de expansão de nomes (`aberto`) usa a nova chave.
7. Layout mobile preservado: linhas empilhadas, badges com `flex-wrap`, sem rolagem horizontal.
