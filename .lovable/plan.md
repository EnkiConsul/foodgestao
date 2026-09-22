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

### 2. Ficha do sócio ganha os benefícios
Você tem razão: confirmei na ficha que, quando o vínculo é sócio, a tela mostra somente "Remuneração do sócio" (forma de remuneração e pró-labore) e esconde completamente vale-alimentação, vale-transporte e a lista de benefícios da empresa. Por isso não há como cadastrar nem como tirar o vale da Tamires — o valor de R$ 24 existe no cadastro dela mas fica invisível.

O que muda:

- A ficha do sócio passa a ter o bloco de benefícios: vale-alimentação, vale-transporte (com valor, dias-base, dia de pagamento e regras de desconto) e os benefícios cadastrados da empresa, com os mesmos campos usados nos demais vínculos.
- O bloco de remuneração do sócio continua como está, acima dos benefícios, deixando claro que vale é opcional e não faz parte da folha CLT.
- O sócio entra no cálculo dos vales exatamente conforme o que estiver marcado na ficha dele — nada de regra escondida excluindo ou incluindo sócio.
- No cálculo mensal, quem está marcado sem valor por dia aparece com o aviso "Sem valor por dia cadastrado", para não pagar errado nem perder alguém de vista.

Depois disso você mesmo consegue abrir a ficha da Tamires e deixar o vale-alimentação como deve ser — marcado com o valor certo ou desmarcado.

## Detalhes técnicos

- `src/pages/dp/DpBeneficios.tsx`: substituir o card de filtro único por `DpFilters` + `DpFilterField` (mesmo padrão de `DpColaboradores.tsx`), com estados `search`, `unidadeFilter`, `cargoFilter`, `situacaoFilter`, `colabFilter`; repassar o conjunto para calculadora, cadastro e histórico.
- `useDpValeCalculadora`: receber filtros (unidade, cargo, situação, busca, colaborador) em vez de só `unidadeFilter`; sem exclusão por vínculo — a flag da ficha segue sendo a única fonte; linhas com flag e sem valor por dia ganham aviso próprio.
- `ValeCalculadora.tsx`: remover o Select de unidade interno e consumir os filtros por props; KPIs e CSV seguem as linhas filtradas.
- `ValeHistorico.tsx`: aplicar filtros de unidade/cargo nas apurações.
- Investigar `apply_default_*` / `dp_beneficios_padroes` e o fluxo de criação de colaborador para achar onde `vale_alimentacao` é marcado sem cadastro explícito; corrigir a origem e mostrar a procedência na ficha (`RemuneracaoFields.tsx`).
- Testes novos em `src/lib/dp/__tests__`: filtros combinados (unidade + cargo + situação) e linha com benefício marcado sem valor por dia.
- Nenhuma migration; nenhum dado alterado; nada publicado.
