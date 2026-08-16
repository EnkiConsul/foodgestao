# Sindicato no cadastro do colaborador

## Situação atual (verificada)

- O módulo de sindicatos já existe: `/dp/cadastros/sindicatos`, negociações (`dp_sindicato_negociacoes`), vínculo por unidade (`dp_sindicato_unidades`) e por cargo (`dp_sindicato_cargos`).
- A tabela `dp_colaboradores` já tem a coluna `sindicato_id` (com chave estrangeira para `dp_sindicatos`) — hoje ela nunca é preenchida pela tela.
- O formulário do colaborador (`Dados`, `Horário De Trabalho`, `Remuneração`) não tem nenhum campo de sindicato.

Ou seja: falta apenas a ponta de tela. Nenhuma migração nova é necessária.

## O que será feito

Em vez de uma quarta aba (que ficaria com um único campo), o sindicato entra como um **bloco dentro da aba Dados**, logo abaixo de Cargo/Unidade — que é de onde o sindicato é herdado. Se preferir aba separada, é só dizer e eu troco.

O bloco "Enquadramento sindical" terá:

1. **Sindicato representativo** — seleção entre os sindicatos ativos da empresa, gravando em `dp_colaboradores.sindicato_id`.
2. **Sugestão automática** — ao escolher Unidade e Cargo, o sistema sugere o sindicato vinculado àquela unidade/cargo, com um botão "Usar sugestão". O campo continua editável (exceções existem).
3. **Contexto da convenção** — quando há sindicato definido, mostra em texto curto: tipo (laboral/patronal), data-base e a negociação vigente (CCT/ACT, vigência e reajuste), com link para a negociação no cadastro de sindicatos.
4. **Aviso quando vazio** — se a unidade do colaborador tem sindicato vinculado e o colaborador está sem enquadramento, aparece um alerta informativo (não bloqueia o salvamento), no mesmo tom dos avisos jurídicos já usados no cadastro.

Na **ficha do colaborador** (visualização ao clicar na linha) o sindicato passa a aparecer junto de Cargo/Unidade.

## Fora deste escopo

Motor de piso salarial, validação de reajuste obrigatório e contribuição sindical na folha — isso é a Fase 5 completa, que fica para quando você quiser retomar. Aqui entregamos o enquadramento e a visibilidade.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: novo campo `sindicato_id` no estado do formulário, incluído no insert/update e no snapshot de "alterações não salvas"; bloco de UI na aba Dados com `data-field="sindicato_id"` para o foco automático já implementado.
- Novo hook `useSindicatoSugestao(unidadeId, cargoId)` (padrão dos hooks em `src/hooks/`): consulta `dp_sindicato_unidades` e `dp_sindicato_cargos` para sugerir o sindicato, e `dp_sindicato_negociacoes` para a negociação vigente. Reaproveita a lógica de `useSindicatoContextoUnidade`.
- `src/components/dp/ColaboradorFichaDialog.tsx`: linha "Sindicato" na ficha.
- Consultas escopadas por empresa via os helpers de contexto já usados no DP; nenhuma alteração de RLS ou de schema.
