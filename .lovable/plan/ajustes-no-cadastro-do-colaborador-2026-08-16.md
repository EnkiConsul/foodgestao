# Ajustes no cadastro do colaborador

## 1. Abrir cadastro de sindicatos dentro do sistema

Hoje o botão "Abrir cadastro de sindicatos" (bloco Enquadramento Sindical) abre uma nova aba do navegador, saindo da tela.

- O botão passa a navegar dentro do próprio sistema para a tela de Sindicatos, sem nova aba.
- Antes de navegar, o diálogo de cadastro do colaborador é fechado, para não ficar sobreposto.

## 2. Salário travado no cargo (aba Remuneração)

Hoje o salário base é editável livremente no colaborador; a divergência só é barrada no salvamento, com um diálogo pedindo para criar variação do cargo ou usar o salário do cargo.

Passa a funcionar assim:

- Quando o cargo selecionado tem salário de referência e a forma de pagamento é mensalista, o campo "Salário base" fica somente leitura, preenchido automaticamente com o salário do cargo.
- Ao lado do campo aparece a indicação de que o valor vem do cargo, com atalho "Alterar no cargo" que leva ao cadastro de Cargos e Salários (navegação interna, mesmo padrão do item 1).
- Para pagar diferente, o caminho é criar/selecionar outro cargo (ou variação) — o diálogo de conflito deixa de ser necessário nesse fluxo mensalista.
- Se o cargo não tiver salário cadastrado, o campo continua editável como hoje e o sistema segue oferecendo gravar esse valor como referência do cargo.
- Horista/diarista continuam com a base de cálculo atual (valor da hora/dia derivado da base), sem mudança de comportamento.

## Detalhes técnicos

- `src/components/dp/SindicatoEnquadramentoField.tsx`: remover `target="_blank" rel="noreferrer"`; usar `useNavigate` para `/dp/cadastros/sindicatos` no `onClick`, chamando antes um novo callback opcional `onBeforeNavigate`.
- `src/components/dp/ColaboradorFormDialog.tsx`: passar o callback que fecha o diálogo; sincronizar `rem.salario_base` com o salário do cargo quando mensalista + cargo com salário, e pular o fluxo de `CargoSalarioConflitoDialog` nesse caso (mantido para os demais).
- `src/components/dp/RemuneracaoFields.tsx`: nova prop de bloqueio derivada de `salarioCargo` + forma mensalista; `readOnly` no input com estilo `bg-muted/60`, texto explicativo e link interno para Cargos.
