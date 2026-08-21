# Prêmio de Assiduidade em Cargos e Salários

Hoje, na aba **Complementos Salariais** (Cargos e Salários), o card "Prêmio de Assiduidade" só tem a chave "Usar nesta empresa" e um botão que joga o usuário para outra tela. Nenhum dos campos já cadastrados na remuneração do colaborador aparece ali.

A correção é trazer exatamente os mesmos campos para dentro do card, lendo e gravando o mesmo padrão que a ficha do colaborador usa — como já foi feito para Vale-Alimentação e Vale-Transporte.

## O que passa a existir no card

Resumo do que está valendo hoje (tipo, valor, critério, tolerância, limites) e um botão "Editar Regras" que abre o diálogo de edição com os campos:

- Prêmio de assiduidade ativo (sim/não)
- Tipo: valor mensal ou percentual do salário
- Valor / percentual (com prévia em R$ quando percentual)
- Critério de perda do prêmio
- Tolerância de atraso (minutos)
- Máximo de atrasos no mês
- Considera atestado (sim/não) e máximo de atestados

Igual ao diálogo dos vales, a edição escolhe o alcance:

- Escopo: Empresa, Unidade ou Cargo
- Aplicar em: só nos próximos cadastros, em todos os ativos do escopo ou em colaboradores selecionados

Editar aqui reflete na ficha do colaborador e vice-versa: é o mesmo registro de padrão. A ficha continua podendo abrir exceção individual.

Quando a chave "Usar nesta empresa" está desligada, o card mostra apenas o aviso de que a empresa não usa o prêmio.

## Detalhes técnicos

- Novo componente `src/components/dp/cargos/AssiduidadeRegrasDialog.tsx`, espelhando `beneficios/ValeRegrasDialog.tsx`: usa `remuneracaoBlank`/`RemuneracaoFormState`, `resolverPadrao`, `aplicarPadrao`, `extrairPadrao` e grava por `useSalvarDpBeneficiosPadrao` com `grupos: ["assiduidade"]` (grupo já definido em `CAMPOS_POR_GRUPO`).
- `ComplementosSalariaisPanel.tsx`: o card de assiduidade passa a ler `useDpBeneficiosPadroes()` para montar o resumo do padrão vigente (empresa e escopos com regra própria) e abre o novo diálogo; o botão "Abrir padrão de remuneração" sai.
- Os controles de campo são extraídos do bloco de assiduidade de `RemuneracaoFields.tsx` para um componente compartilhado (`AssiduidadeFields`), consumido pelas duas telas, evitando divergência de campos no futuro.
- Nenhuma mudança de banco: os campos já existem em `dp_beneficios_padroes.payload` e nas colunas de `dp_colaboradores`.
