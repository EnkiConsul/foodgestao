# Filtros na tela de Benefícios e sócio fora dos vales

## O que muda

### 1. Filtros na tela de Benefícios
Hoje a tela só tem o seletor "Colaborador". Passa a ter a mesma barra de filtros das outras telas de Pessoas 360°:

- Busca por nome
- Unidade
- Cargo
- Situação (ativos, desligados, todos)
- Colaborador (o que já existe)
- Chips do que está filtrado e botão para limpar tudo

Os filtros valem para as três abas:
- **Cálculo Mensal**: a lista de colaboradores e os totais passam a respeitar unidade, cargo, situação, busca e colaborador (hoje só respeita unidade dentro da própria aba, num seletor separado que sai daqui).
- **Cadastro de Benefícios**: a lista de benefícios atribuídos respeita os mesmos filtros.
- **Histórico**: os ciclos fechados passam a poder ser filtrados por unidade e cargo.

O seletor de unidade que existe dentro da calculadora deixa de ser duplicado: passa a usar a barra de filtros da tela, mantendo o mês do pagamento junto dos botões de exportar e fechar ciclo.

### 2. Sócio não entra nos vales
Tamires está cadastrada como sócia e aparece no cálculo do vale-alimentação. A tela passa a:

- Deixar sócios fora do cálculo mensal, do fechamento de ciclo, do histórico e do CSV dos vales — igual ao que já acontece com férias e jornada, onde sócio não entra.
- Na ficha do colaborador, ao marcar o vínculo como sócio, os vales ficam desmarcados e indisponíveis, com a explicação de que sócio recebe por pró-labore ou lucros, e não por benefício de vale.
- Um filtro "Sócios" continua disponível na lista de colaboradores, então nada deixa de ser localizável.

Observação: na ficha da Tamires o vale-alimentação está marcado com R$ 24 por mês, mesmo você não tendo cadastrado. A causa desse preenchimento ainda não está comprovada (provavelmente veio do padrão de benefícios aplicado no cadastro). Com a mudança acima ela deixa de aparecer no cálculo de imediato. Limpar essa marcação na ficha dela é uma alteração de dado e só faço com a sua autorização — me diga se quer que eu limpe.

## Detalhes técnicos

- `src/pages/dp/DpBeneficios.tsx`: substituir o card de filtro único por `DpFilters` + `DpFilterField` (mesmo padrão de `DpColaboradores.tsx`), com estados `search`, `unidadeFilter`, `cargoFilter`, `situacaoFilter`, `colabFilter`; repassar o conjunto para calculadora, cadastro e histórico.
- `useDpValeCalculadora`: receber filtros (unidade, cargo, situação, busca, colaborador) em vez de só `unidadeFilter`; incluir `vinculo_label` no select e excluir `isSocio(vinculo_label)` das linhas; `useDpBeneficios`/`useDpBeneficiosCadastro`/`useDpValeHistorico` passam a aceitar os mesmos filtros.
- `ValeCalculadora.tsx`: remover o Select de unidade interno e consumir os filtros por props; KPIs e CSV seguem as linhas filtradas.
- `ValeHistorico.tsx`: aplicar filtros de unidade/cargo nas apurações.
- `RemuneracaoFields.tsx` / `ColaboradorFormDialog.tsx`: quando `isSocio(vinculo_label)`, desmarcar e bloquear vale-alimentação e vale-transporte com texto explicativo.
- Testes novos em `src/lib/dp/__tests__`: sócio fora das linhas de vale e filtros combinados (unidade + cargo + situação).
- Nenhuma migration; nenhum dado alterado; nada publicado.
