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

### 2. Vale só para quem tem o benefício de fato na ficha
Sócio continua podendo receber vale — desde que o benefício esteja cadastrado na ficha dele. O problema da Tamires é outro: na ficha dela o vale-alimentação está marcado com R$ 24 por mês, mesmo você não tendo cadastrado nada (provavelmente veio do padrão de benefícios aplicado no cadastro; a causa exata ainda não está comprovada).

O que muda:

- Antes de qualquer outra coisa, verifico como essa marcação foi criada (padrão de benefícios por cargo/unidade aplicado no cadastro, importação ou edição) e corrijo a origem, para não voltar a marcar vale em quem não tem.
- A ficha passa a mostrar com clareza de onde veio o vale: "cadastrado na ficha" ou "herdado do padrão da empresa/cargo", com a opção de remover.
- No cálculo mensal, quem está marcado mas sem valor por dia continua aparecendo com o aviso "Sem valor por dia cadastrado", para você não pagar errado nem perder alguém de vista.
- Nenhuma regra nova exclui sócio: a lista dos vales segue exatamente o que está na ficha de cada pessoa.

Limpar a marcação de vale-alimentação na ficha da Tamires é alteração de dado: só faço com a sua autorização — me diga se quer que eu tire.

## Detalhes técnicos

- `src/pages/dp/DpBeneficios.tsx`: substituir o card de filtro único por `DpFilters` + `DpFilterField` (mesmo padrão de `DpColaboradores.tsx`), com estados `search`, `unidadeFilter`, `cargoFilter`, `situacaoFilter`, `colabFilter`; repassar o conjunto para calculadora, cadastro e histórico.
- `useDpValeCalculadora`: receber filtros (unidade, cargo, situação, busca, colaborador) em vez de só `unidadeFilter`; sem exclusão por vínculo — a flag da ficha segue sendo a única fonte; linhas com flag e sem valor por dia ganham aviso próprio.
- `ValeCalculadora.tsx`: remover o Select de unidade interno e consumir os filtros por props; KPIs e CSV seguem as linhas filtradas.
- `ValeHistorico.tsx`: aplicar filtros de unidade/cargo nas apurações.
- Investigar `apply_default_*` / `dp_beneficios_padroes` e o fluxo de criação de colaborador para achar onde `vale_alimentacao` é marcado sem cadastro explícito; corrigir a origem e mostrar a procedência na ficha (`RemuneracaoFields.tsx`).
- Testes novos em `src/lib/dp/__tests__`: filtros combinados (unidade + cargo + situação) e linha com benefício marcado sem valor por dia.
- Nenhuma migration; nenhum dado alterado; nada publicado.
