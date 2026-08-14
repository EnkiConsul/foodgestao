# Cadastro centralizado no colaborador

Objetivo: o administrador cadastra tudo dentro do colaborador, e os cadastros de apoio (cargos, turnos, unidades) vão sendo alimentados automaticamente, para depois serem reaproveitados em novos cadastros.

## 1. Vigência da jornada a partir da admissão

- Na aba **Turno & Jornada**, quando o colaborador ainda não tem nenhuma configuração salva, a vigência assume automaticamente a **data de admissão** e é exibida como um texto informativo ("Vigente desde a admissão: 01/03/2026"), não como campo de digitação.
- O campo de data só aparece quando o administrador clica em **"Mudança de horário a partir de outra data"**, que é o caminho para criar uma nova versão da jornada.
- Ao editar um colaborador que já tem jornada vigente, o padrão passa a ser "manter a vigência atual" e só é criada nova versão se o administrador informar a nova data.
- Se não houver data de admissão preenchida, o sistema pede a data (comportamento atual).

## 2. Cargo e salário criados a partir do colaborador

Regra: **um cargo = um salário**.

- No campo Cargo do colaborador, além dos cargos existentes, entra a opção **"+ Criar novo cargo"**, que abre um formulário curto (nome, CBO opcional, insalubre/periculoso) sem sair do cadastro.
- Cada cargo da lista mostra o salário de referência ao lado do nome, para o administrador escolher com contexto.
- Ao salvar o colaborador com salário informado:
  - **Cargo sem salário cadastrado**: o sistema pede confirmação ("Definir R$ 2.200,00 como salário de referência do cargo ATENDENTE?"). Confirmando, grava no cargo; recusando, salva apenas no colaborador.
  - **Cargo com salário igual**: salva normalmente.
  - **Cargo com salário diferente**: o salvamento é **bloqueado** e abre um diálogo explicando o conflito, com as saídas:
    1. **Criar variação do cargo** — sugere um nome derivado (ex.: `ATENDENTE II`, e assim por diante conforme já existirem), cria o cargo com o novo salário e já o vincula ao colaborador;
    2. **Usar o salário do cargo** — ajusta o campo do formulário para o valor do cargo;
    3. Cancelar e revisar.
- Para horista/diarista a comparação usa a **base salarial** (salário referência), não o valor da hora derivado.

## 3. Reaproveitamento nos demais cadastros

- Turnos: já podem ser criados de dentro do colaborador; a tela de Turnos continua sendo a lista consolidada.
- Cargos: passam a ser criados/completados pelo cadastro do colaborador e a tela de Cargos ganha um aviso quando um cargo tem colaboradores com salário divergente, com atalho para normalizar.
- A tela de Cargos mantém a mesma regra: bloqueia salvar dois cargos ativos com nome igual e avisa quando o salário do cargo é alterado, informando quantos colaboradores usam aquele cargo.

## Detalhes técnicos

- `ColaboradorJornadaPanel.tsx`: novo estado `vigenciaModo` (`admissao` | `nova_data`); recebe `dataAdmissao` via prop de `ColaboradorFormDialog` e `ColaboradorConfigTrabalhoDialog`.
- `src/lib/dp/cargos.ts` (novo): `salarioReferencia`, `compararSalarioCargo` (retorna `ok` | `cargo_sem_salario` | `divergente`) e `sugerirNomeVariacao(nome, cargosExistentes)` — com testes unitários em `src/lib/dp/__tests__/cargos.test.ts`.
- `ColaboradorFormDialog.tsx`: intercepta o submit, roda a comparação e abre `CargoSalarioConflitoDialog.tsx` (novo) ou o confirm de "definir salário do cargo"; usa `useDpCargos().salvar` para criar/atualizar o cargo antes de gravar o colaborador.
- `CargoQuickCreateDialog.tsx` (novo): criação inline de cargo a partir do select.
- Sem mudança de banco: `dp_cargos.salario_base` e `dp_colaboradores.salario_base`/`base_salarial` já existem.
