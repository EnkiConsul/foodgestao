# Relatório de Programação de Férias

Criar um relatório sintético de férias no mesmo formato do que a contabilidade enviou, visível em tela e disponível para download.

## Onde fica

Nova aba **Programação** dentro de Férias (ao lado de Planejamento, Solicitações, Programadas...). Abre já com todos os colaboradores ativos da empresa.

## O que aparece

Cabeçalho igual ao modelo: razão social, CNPJ, data-base, data e hora de emissão, título "PROGRAMAÇÃO DE FÉRIAS", número de página no impresso e total de empregados no rodapé.

Uma linha por período aquisitivo, agrupada por colaborador (o segundo período fica logo abaixo, sem repetir nome), na mesma ordem alfabética do modelo, com as colunas:

- Código e nome do empregado
- Data de admissão
- Vencimento das férias
- Férias vencidas (quantidade) e mês/parcela do 13º quando houver
- Início e fim do período aquisitivo
- Início do gozo, dias, abono, 13º
- Dias de direito, gozados e restantes
- Limite para gozo
- Dias de afastamento e de faltas

Campos ainda não definidos aparecem como no relatório da contabilidade (`..../..../......` e `....`).

## Filtros e sinalizações

- Filtro por unidade e opção "incluir desligados" (padrão desligado, como nas outras telas de férias).
- Linhas com marcação atrasada, risco de dobra ou período vencido recebem destaque visual em tela, usando as mesmas regras já existentes. O arquivo impresso mantém o formato limpo do modelo.
- Sócios continuam fora do relatório, por não terem férias legais.

## Download

- **Imprimir / PDF**: abre uma versão em HTML paisagem A4 pronta para imprimir ou salvar em PDF, com a mesma diagramação do relatório recebido.
- **CSV**: mesmas colunas, separador `;` e UTF-8 com BOM, para abrir no Excel.

## Detalhes técnicos

- Novo `src/lib/dp/ferias-programacao.ts`: monta as linhas a partir de `dp_ferias_periodos` (`inicio_aquisitivo`, `fim_aquisitivo`, `dias_direito`, `dias_gozados`, `dias_saldo`, `limite_concessivo`, `faltas_injustificadas`) cruzando com `dp_ferias_gozos` (`data_inicio`, `dias`, `dias_abono`, `adiantar_13`) e com o colaborador (matrícula, nome, admissão). Funções puras + geradores de CSV e de HTML imprimível, no padrão de `src/lib/dp/holerite.ts` e `folha-relatorios.ts`.
- Novo hook `src/hooks/useDpFeriasProgramacao.tsx` com a consulta por empresa (respeitando RLS e filtros de unidade/desligados).
- Novo `src/components/dp/ferias/FeriasProgramacaoPanel.tsx` com tabela densa, rolagem horizontal no mobile e botões Imprimir/CSV; registrado como aba em `src/pages/dp/DpFeriasHub.tsx`.
- Testes unitários para montagem das linhas e para o CSV.
- Sem mudanças de banco.
