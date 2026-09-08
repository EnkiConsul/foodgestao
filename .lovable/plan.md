# Férias: nunca deixar acumular dois períodos (risco de pagamento em dobro)

## O que a lei diz (e o que o sistema precisa deixar óbvio)
As férias precisam ser concedidas dentro dos 12 meses seguintes ao fim do período de 12 meses trabalhados. Se passar desse prazo, a empresa paga em dobro. Na prática, quando uma pessoa acumula dois períodos com saldo, um deles já está estourando ou vai estourar em pouco tempo — é aí que nasce o custo dobrado.

Hoje o sistema já mostra "A conceder", "Atenção" e "Vencido" por período. O que falta é a leitura por pessoa: "esta pessoa tem mais de um período em aberto e isso vira dinheiro perdido".

## O que será construído

1. **Selo por pessoa: "Risco de dobra"**
   - Quando a pessoa tem 2 ou mais períodos com saldo (fora os de controle externo/histórico), aparece um selo vermelho na lista de férias e na ficha, com a frase: "2 períodos em aberto — risco de pagar férias em dobro".
   - Ao lado, a data-limite mais próxima e quantos dias faltam.

2. **Card no painel de Férias: "Risco de pagamento em dobro"**
   - Novo card contando as pessoas nessa situação, ao lado dos cards atuais.
   - Clicar leva para a lista já filtrada por essas pessoas, ordenada pelo prazo mais curto.

3. **Ordem correta ao programar (mais antigo primeiro)**
   - Ao marcar férias de quem tem mais de um período em aberto, o sistema já sugere o período mais antigo.
   - Se o usuário escolher o período mais novo deixando o antigo em aberto, aparece um aviso claro: "O período de {datas} vence primeiro e ainda tem {n} dias. Programar o mais novo pode gerar pagamento em dobro." O usuário pode seguir escrevendo o motivo (fica registrado), não é bloqueio cego.

4. **Explicação em linguagem simples**
   - Um texto curto de apoio na aba Regras explicando o prazo de 12 meses, o pagamento em dobro e como o sistema sinaliza cada estágio (Planejar → A conceder → Atenção → Vencido → Risco de dobra).

5. **Aviso no cadastro de regras de férias**
   - Na configuração da empresa, deixar visível que a política escolhida para ciclos encerrados ("A conceder" por padrão) é só a forma de avisar — o prazo legal e o risco de dobra continuam valendo em qualquer opção.

## O que não muda
- Cálculo de direito, faltas, saldos e períodos: intactos.
- Aprovações, solicitações do colaborador, feriados, bloqueios e limites simultâneos: intactos.
- Nenhuma mudança em multiempresa, permissões ou banco de dados — é leitura e sinalização sobre o que já existe.

## Detalhes técnicos
- Nova função pura em `src/lib/dp/ferias-direito.ts`: `riscoAcumulo({ periodos, hojeISO, politica })` retornando `{ emRisco, periodosAbertos, periodoMaisAntigo, diasParaLimite }`, mais `NIVEL_VENCIMENTO_META` estendido com o tom do selo de risco.
- Agregação por colaborador em `src/pages/dp/DpFerias.tsx` e `src/components/dp/ferias/FeriasDashboard.tsx` (novo card + seção "Atenções" priorizando risco de dobra).
- Aviso de ordem FIFO no diálogo de programação de férias (componente de marcação em `src/components/dp/ferias/`), reaproveitando o padrão de justificativa já usado em antecedência (`FERIAS_AVISO_ANTECEDENCIA`).
- Testes em `src/lib/dp/__tests__/ferias-direito.test.ts`: um período aberto não gera risco; dois períodos com saldo geram; período de controle externo não conta; período sem saldo não conta; ordem do mais antigo.
- Rollback: reverter os arquivos citados; nada persistido.
