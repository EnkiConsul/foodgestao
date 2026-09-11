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
- Sócios continuam fora do relatório, por não terem férias legais.

## Sinalização de risco (tela e impresso)

Coluna extra **Situação** ao final, com selo e cor por período, usando as mesmas regras já existentes em `ferias-direito.ts`:

- Vermelho — **Pagamento em dobro**: prazo legal estourado (férias vencidas).
- Vermelho — **Marcação atrasada**: o tempo que falta para vencer já é menor que os dias restantes a gozar.
- Laranja — **Risco de dobra**: faltam até 90 dias para o limite concessivo.
- Amarelo — **Acompanhar**: janela de 180 a 90 dias antes do limite.
- Cinza — **Dentro do prazo**.

Duas colunas extras calculadas (úteis no CSV): **Dias p/ limite** (dias restantes até o limite concessivo) e **Dias p/ marcar** (dias restantes de saldo a gozar), que permitem à contabilidade ordenar por urgência.

No impresso/PDF o selo mantém as cores de fundo claras da situação (o modelo original é preto-e-branco, mas as cores saem legíveis em impressão PB); no CSV vai o texto da situação e os dois números, sem cor.

## Download

- **Imprimir / PDF**: abre uma versão em HTML paisagem A4 pronta para imprimir ou salvar em PDF, com a mesma diagramação do relatório recebido.
- **CSV**: mesmas colunas, separador `;` e UTF-8 com BOM, para abrir no Excel.

## Detalhes técnicos

- Novo `src/lib/dp/ferias-programacao.ts`: monta as linhas a partir de `dp_ferias_periodos` (`inicio_aquisitivo`, `fim_aquisitivo`, `dias_direito`, `dias_gozados`, `dias_saldo`, `limite_concessivo`, `faltas_injustificadas`) cruzando com `dp_ferias_gozos` (`data_inicio`, `dias`, `dias_abono`, `adiantar_13`) e com o colaborador (matrícula, nome, admissão). Funções puras + geradores de CSV e de HTML imprimível, no padrão de `src/lib/dp/holerite.ts` e `folha-relatorios.ts`.
- Novo hook `src/hooks/useDpFeriasProgramacao.tsx` com a consulta por empresa (respeitando RLS e filtros de unidade/desligados).
- Novo `src/components/dp/ferias/FeriasProgramacaoPanel.tsx` com tabela densa, rolagem horizontal no mobile e botões Imprimir/CSV; registrado como aba em `src/pages/dp/DpFeriasHub.tsx`.
- Testes unitários para montagem das linhas e para o CSV.
- Sem mudanças de banco.
