# Mão de obra extra na rotina: pessoa certa, dia certo, horário sem conflito

Corrige quatro problemas do lançamento de mão de obra extra na rotina do dia.

## 1. Ninguém desligado onde não pode aparecer

Hoje a lista de pessoas traz todo mundo, inclusive quem já saiu e não tem nenhum vínculo ativo.

- A lista passa a mostrar apenas quem estava com contrato válido no dia lançado: já admitido e ainda não desligado naquela data.
- Quem saiu continua aparecendo para dias anteriores ou iguais à data de saída, para corrigir registros passados; nesses casos o nome vem com a marca "Desligado em dd/mm".
- Trocar a data do lançamento atualiza a lista; se a pessoa escolhida deixar de ser válida para a nova data, o campo é limpo com um aviso curto.

## 2. A data vem do dia que o gestor abriu

Ao clicar no dia 10 o formulário abria com o dia de hoje. A data inicial e final passam a vir sempre do dia clicado no calendário/rotina, sem "corrigir" para hoje.

## 3. Dia futuro liberado, com atalho para convocação

O bloqueio "para dias futuros use a convocação ou a escala" sai.

- Qualquer pessoa pode ser lançada em dia futuro pela rotina.
- Quando a pessoa é intermitente ou freelancer, aparece um aviso sugerindo fazer a convocação e um botão que abre a convocação já com aquele dia, unidade, cargo e pessoa preenchidos. O gestor pode seguir pelo lançamento simples se quiser.
- Para contrato fixo (mensalista, parcial, sócio) nada é sugerido: é só um dia extra de trabalho.

## 4. Horário conflitante é bloqueado com sugestão

Se a pessoa já está prevista naquele dia (escala publicada, padrão da rotina, convocação aceita ou outro lançamento extra):

- Um aviso mostra o que ela já tem no dia: "Hanna já está prevista das 10:00 às 18:00 (escala do dia)".
- Se o horário digitado se sobrepõe ao previsto, o salvamento é bloqueado com a mensagem do conflito e o sistema sugere o próximo horário livre do dia (por exemplo, começando ao fim do turno já previsto), que o gestor pode aplicar com um toque.
- Sem sobreposição, o aviso é só informativo e o salvamento segue normal.
- Turnos que viram o dia contam a passagem da meia-noite na comparação.

## 5. Aviso de risco legal para jornada extra de contrato fixo

Lançar um dia extra para quem é CLT (mensalista, parcial, intermitente fora da convocação) tem risco legal e o gestor precisa ver isso na hora.

- Quando a pessoa selecionada é de contrato fixo, aparece um aviso jurídico (não bloqueante) ao lado do lançamento: dia extra exige pagamento de horas extras ou compensação registrada; habitualidade de dias extras fora da escala pode reforçar jornada superior à contratada; sem registro correto, vira passivo de horas extras.
- O aviso segue o estilo orientador já usado no cadastro de vínculos (`src/lib/dp/regime-riscos.ts`): informa e orienta, sem impedir o gestor de decidir.
- Sócio é isento desse aviso (não é relação de emprego).

## Detalhes técnicos

- `src/lib/dp/operacao-extra.ts` (novo, funções puras + testes): `colaboradoresElegiveisNoDia()` (admissão/desligamento/ativo por data), `previsaoNoDia()` (extrai horários já previstos de `ResultadoDia.pessoas` e dos avulsos), `conflitoDeHorario()` (sobreposição com suporte a `termina_no_dia_seguinte`) e `sugerirHorarioLivre()`.
- `src/components/dp/DpPessoaAvulsaDialog.tsx`: remove o clamp `dataInicial > hoje ? hoje : dataInicial` e o `toast` de data futura; filtra o select por `colaboradoresElegiveisNoDia`; mostra o bloco de previsão/conflito com botão "Usar horário sugerido"; mostra o atalho de convocação quando `regime`/`vinculo_label` é intermitente ou freelancer (usa `src/lib/dp/contrato-policy.ts` para classificar).
- `src/pages/dp/DpOperacaoPanorama.tsx`: passa `contarData` (ou um `previsaoDoDia(data, colaboradorId)` derivado dele) e `onIrParaConvocacao` para o diálogo; `abrirNovaAvulsa` mantém a data do dia clicado.
- `ColaboradorPanorama` já traz `ativo`, `data_admissao`, `data_desligamento`, `regime` e `vinculo_label` — não precisa mudar consulta nem banco.
- Nenhuma migração: as regras são de tela e de domínio.
- Verificação: typecheck, testes de `src/lib/dp`, e checagem no navegador abrindo o dia 10/09 com a Hanna (data correta, conflito bloqueado, sugestão aplicável).
