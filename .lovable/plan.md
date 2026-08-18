# Adiantamento por unidade, sugestão de horário e salvamento do piso

## Objetivo

Facilitar três etapas do cadastro do colaborador: alterar o dia do adiantamento sem sair da ficha, iniciar o horário com a rotina mais usada e concluir corretamente a definição do piso salarial.

## 1. Atalho para adiantamento salarial da unidade

Hoje o dia fica em **Pessoas > Cadastros > Unidades**, nos campos “Tem adiantamento salarial” e “Dia do Adiantamento”. Na aba **Remuneração** do colaborador, o sistema apenas mostra esse dia.

- Transformar a informação do dia em uma ação **Editar regra da unidade** ao lado de “Opta por Adiantamento Salarial”.
- Abrir um diálogo enxuto, mantendo o usuário dentro do cadastro do colaborador, para ativar/desativar o adiantamento e escolher o dia 1–28 da unidade selecionada.
- Salvar na própria unidade, atualizar imediatamente o texto e a sugestão de adesão do colaborador, sem fechar nem perder os dados já preenchidos na ficha.
- Exibir o atalho apenas para contratos/formas de pagamento que admitem adiantamento e quando uma unidade estiver selecionada.

## 2. Horário sugerido por cargo

Ao abrir **Horário de Trabalho** em um colaborador novo:

1. Buscar as configurações de trabalho vigentes da empresa e agrupar rotinas equivalentes pelo conjunto completo: horário base, dias trabalhados, horários diferentes por dia e tipo de folga.
2. Priorizar a rotina mais usada por colaboradores do mesmo **cargo**.
3. Se o cargo ainda não tiver histórico, usar a rotina mais frequente entre todos os colaboradores da empresa.
4. Em caso de empate, preferir a rotina usada mais recentemente.

A sugestão preencherá automaticamente a aba somente uma vez no cadastro novo, com o aviso “Horário sugerido com base no cargo/empresa — pode ajustar”. Não será aplicada em edição, não sobrescreverá alterações manuais e continuará permitindo copiar de um colega ou usar a grade semanal da unidade.

## 3. Fechar corretamente o diálogo do piso cargo + patronal

O fluxo de definição do piso dentro do cadastro chama o salvamento, fecha o alerta e volta a executar o cadastro. Como a consulta do piso pode ainda estar com o valor anterior em cache, a validação reabre o mesmo alerta; o novo clique tenta inserir novamente e encontra o piso já gravado.

- Tratar a definição do piso como uma única operação protegida contra duplo envio.
- Após gravar, atualizar/aguardar o cache de salários do cargo antes de retomar o salvamento do colaborador.
- Marcar localmente a decisão como resolvida durante toda a continuação do fluxo, fechar o alerta imediatamente e manter o botão em estado “Salvando…”.
- Se o piso já existir por uma atualização concorrente, recarregar o valor e continuar quando ele corresponder ao cargo + patronal, em vez de induzir um segundo cadastro.
- Manter erros reais visíveis quando houver conflito de vigência ou outro problema legítimo.

## Detalhes técnicos

- Reutilizar a mutação de unidades e invalidar `dp_unidades` no novo diálogo de adiantamento.
- Estender o modelo de horários para carregar `cargo_id` e datas de uso; criar uma função pura de assinatura/ranking da rotina para permitir testes determinísticos.
- Aplicar a sugestão em `ColaboradorJornadaPanel` somente quando não houver configuração vigente, houver cargo selecionado e o formulário de jornada ainda não tiver sido alterado.
- Passar `cargo_id` do formulário do colaborador ao painel de horário.
- Corrigir o alerta de piso em `ColaboradorFormDialog` sincronizando a query `dp_cargo_salarios` antes de chamar novamente o fluxo de salvamento.
- Adicionar testes para prioridade por cargo, fallback da empresa, empate por recência, proteção contra sobrescrita e continuidade após salvar o piso.
- Sem alteração de estrutura do banco de dados.