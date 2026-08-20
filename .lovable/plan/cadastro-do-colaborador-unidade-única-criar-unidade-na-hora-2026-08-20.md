# Cadastro do colaborador: unidade única, criar unidade na hora e prévia real do horário do colega

## 1. Criar unidade direto do cadastro do colaborador

Hoje o campo Unidade só permite escolher entre as unidades existentes; para criar uma é preciso sair para a tela de Unidades.

- O formulário de unidade que hoje vive dentro da tela `/dp/cadastros/unidades` passa a ser um componente reutilizável (`UnidadeFormDialog`), com os mesmos campos e o mesmo preenchimento por CNPJ/BrasilAPI que já existem.
- A tela de Unidades continua funcionando igual, só passa a usar esse componente.
- No campo Unidade da aba **Dados** entra a ação "Nova unidade", no mesmo padrão do "Novo cargo" já existente. Ao salvar, a unidade é criada de verdade em Unidades (mesma tabela e mesmas regras) e já fica selecionada no colaborador.

## 2. Um único campo de Unidade

- O seletor de Unidade da aba **Horário de trabalho** é removido.
- O painel de horário passa a usar a unidade escolhida na aba Dados (já recebe esse valor hoje), mostrando-a como texto informativo com atalho para a aba Dados quando ainda não houver unidade definida.
- Nada muda no que é gravado: a configuração de trabalho continua salva com a unidade do colaborador.

## 3. Atalhos de cópia na mesma linha

- Os nomes dos colegas passam para a mesma linha do botão "Copiar de Outro Colaborador", com o rótulo "ou copie de:" e quebra de linha automática em telas estreitas.
- A ordenação, a deduplicação e o comportamento do clique (copia a semana inteira) permanecem como estão.

## 4. Hover mostra a jornada inteira, não só um horário

Hoje o hover mostra apenas o horário base, então quem tem sexta/sábado/domingo diferentes parece ter um horário só.

- O texto do hover passa a agrupar dias consecutivos com o mesmo horário, por exemplo:
  `Cristiane · Seg–Qui 17:00–00:00 (30 min) · Sex–Dom 16:30–00:35 (30 min) · Folga: Qui`
- Dias de folga aparecem no fim; folga variável é indicada como "folga conforme escala".
- Mesma prévia curta é usada na linha de cada colega no diálogo "Copiar de outro colaborador", para as duas telas contarem a mesma coisa.

## Detalhes técnicos

- Novo `src/components/dp/UnidadeFormDialog.tsx` extraído de `src/pages/dp/DpUnidades.tsx` (form, validação, lookup de CNPJ), usando `useUpsertDpUnidade`; a mutação passa a devolver o id da unidade criada para permitir a seleção automática.
- `ColaboradorFormDialog.tsx`: ação "Nova unidade" ao lado do select de Unidade (aba Dados), espelhando `CargoQuickCreateDialog`.
- `ColaboradorJornadaPanel.tsx`: remove o estado/select `unidadeId`, derivando a unidade de `colaborador.unidade_id`; reposiciona `atalhosColegas` na fileira do botão de copiar.
- Nova função em `src/lib/dp/config-trabalho.ts` para resumir a semana por faixas de dias consecutivos (`Seg–Qui …`), com teste unitário cobrindo semana uniforme, semana com sexta/sábado/domingo diferentes e folga variável. `CopiarConfigColaboradorDialog.tsx` passa a usar esse resumo.
- Sem mudanças de banco de dados.
