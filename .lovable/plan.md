# Horário de Trabalho: orientação jurídica no vínculo, alertas certos e um só botão de salvar

Cinco ajustes no cadastro do colaborador.

## 0. Orientação jurídica no tipo de vínculo (Freelancer, PJ e MEI)

Cada tipo de vínculo de risco ganha uma faixa âmbar logo abaixo do campo, em linguagem de dono de loja, com um link para a explicação completa e um atalho para o caminho seguro. Nada bloqueia o salvamento — a decisão é do empreendedor.

### Freelancer

"Freelancer" não é figura prevista na CLT. Contratar alguém de forma habitual e subordinada chamando de freelancer é vínculo de emprego não registrado.

> **Freelancer não é um vínculo previsto na lei trabalhista.** Se essa pessoa trabalha com habitualidade, cumpre horário e recebe ordens da sua equipe, a Justiça do Trabalho tende a reconhecer vínculo de emprego — com registro retroativo, férias, 13º, FGTS e multa. Para chamar quando precisa, com segurança, o caminho legal é o **contrato intermitente**.
>
> **Ver como funciona o intermitente** · **Mudar para Intermitente**

### PJ e MEI

Contratar PJ ou MEI é legítimo para serviço autônomo e eventual. O risco é a "pejotização": quando a pessoa trabalha como empregado e emite nota, a Justiça reconhece o vínculo e cobra tudo de uma vez.

> **Atenção ao risco de pejotização.** PJ/MEI só se sustenta quando não há pessoalidade, subordinação, horário imposto nem habitualidade. Se essa pessoa cumpre escala, bate ponto, recebe ordens diretas e presta serviço só para você, a Justiça do Trabalho pode reconhecer vínculo de emprego — com registro retroativo, férias, 13º, FGTS + 40%, INSS e multa; o MEI ainda pode ser desenquadrado. Para quem trabalha em escala na sua operação, o caminho seguro é **CLT** (fixo) ou **intermitente** (por convocação).
>
> **Ver os riscos e alternativas** · **Mudar para Intermitente** · **Mudar para CLT**

O aviso fica mais forte quando o próprio cadastro contradiz a tese de autonomia — colaborador PJ/MEI com horário de trabalho definido, dias fixos ou participação em escala/ponto: nesse caso a faixa acrescenta a linha "Este cadastro tem horário e escala definidos, o que reforça a caracterização de vínculo."

### Diálogos explicativos

**Intermitente**: contrato assinado uma vez, sem jornada fixa; você convoca com 3 dias de antecedência informando o dia, o horário e o valor; o colaborador pode aceitar ou recusar em 1 dia útil sem penalidade; paga-se ao fim de cada convocação o proporcional de salário, férias + 1/3, 13º, DSR e FGTS; entre as convocações não há salário nem exclusividade; o valor da hora não pode ser menor que o do mensalista da mesma função nem que o mínimo por hora. Fecha com o que muda no sistema: as convocações são registradas em Convocações, entram na escala e no ponto e viram lançamentos na folha.

**PJ/MEI**: os quatro elementos que caracterizam vínculo (pessoalidade, subordinação, habitualidade, onerosidade), quando PJ/MEI é adequado (serviço pontual, com autonomia de horário e método, para vários clientes), o que costuma derrubar a tese (escala, ponto, uniforme, cliente único, valor mensal fixo), o custo estimado de um reconhecimento de vínculo e o comparativo lado a lado CLT × Intermitente × PJ para a mesma função.

Os atalhos de troca alteram o vínculo no formulário na hora, mantendo o que já foi digitado e reaplicando as regras do regime (formas de pagamento permitidas, base salarial e de horas).



## 1. Alertas trabalhistas por tipo de vínculo

Hoje o verificador de CLT roda igual para todo mundo. No intermitente isso está errado: o horário cadastrado é apenas **disponibilidade habitual** — as obrigações (44h, DSR, interjornada, jornada máxima) só existem sobre o período efetivamente convocado (art. 452-A da CLT). O mesmo vale para freelancer, PJ e MEI, que não têm jornada contratual.

Passa a valer, usando a política de contrato que o sistema já mantém por regime:

| Vínculo | O que é avaliado no horário do cadastro |
| --- | --- |
| CLT, temporário, estágio | Tudo (jornada diária, 44h semanais, intervalo, interjornada, DSR/folga, menor, noturno) |
| Aprendiz | 6h/dia, intervalo, menor, noturno |
| Intermitente | Somente o que vale por convocação: menor de 18 anos (nada após 22:00, 6h no dia, intervalo de 1h) e o informativo de adicional noturno. Nada de 44h semanais, DSR, interjornada ou "7 dias sem folga" |
| Freelancer, PJ, MEI | Somente menor de 18 anos e o informativo de noturno |

No intermitente, no lugar dos avisos removidos aparece uma nota neutra: "Este horário é a disponibilidade habitual. Os limites de jornada, intervalo e descanso são conferidos na convocação." Onde as regras de fato se aplicam — na **convocação** e no **ponto** — os avisos continuam como estão hoje.

Também fica corrigido um detalhe que hoje gera aviso indevido para qualquer vínculo: a folga do domingo e o "sem folga semanal" só são avaliados quando a folga é fixa; com "folga varia conforme a escala" marcada, quem responde por isso é a escala do mês, não o cadastro.

## 2. Feedback visual ao salvar

Ao salvar o horário com sucesso, a tela rola de volta para o topo da aba "Horário de Trabalho" e o toast de confirmação aparece. O usuário vê a tela mudar de posição e entende que a configuração foi gravada.

## 3. "Salvar Configuração" vira "Salvar"

Rótulo encurtado para **Salvar** (e "Salvando..." durante a gravação).

## 4. Um botão por tela, não dois

O "Atualizar" do rodapé é o botão que grava o **cadastro do colaborador** (dados, remuneração); o "Salvar Configuração" grava a **vigência do horário**. Ter os dois na mesma tela é confuso, como você apontou.

Fica assim: dentro do cadastro do colaborador, o painel de horário não mostra mais botão próprio. O rodapé passa a ter um único **Salvar**, que grava os dados do colaborador e, na mesma ação, a configuração de horário pendente na aba. Quando o horário é aberto pelo atalho isolado (ficha do colaborador), o painel mantém seu próprio **Salvar**, porque ali não existe rodapé.

## Detalhes técnicos

- `src/lib/dp/clt-alertas.ts`: `EntradaAlertasClt` passa a receber o regime e derivar o escopo de verificação via `contratoPolicy` — `validaCargaSemanal`, `exigeFolgaSemanal`/`folgaSemanal` e `horasPorConvocacao` decidem quais blocos rodam. Regras de menor e o informativo noturno valem sempre. `foraDaClt` é substituído por esse escopo. Bloco de folga passa a receber `folgaVariavel` e é ignorado quando true.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: passa `folgaVariavel` ao verificador; nota informativa quando `policy.horasPorConvocacao`; `ref` no topo do painel + `scrollIntoView({ behavior: "smooth", block: "start" })` após salvar com sucesso; rótulo "Salvar"; expõe um handler de salvamento via `ref` (ou callback registrado em `onRegistrarSalvar`) para o diálogo acionar.
- `src/components/dp/ColaboradorFormDialog.tsx`: renderiza o painel com `showSaveButton={false}`, rodapé com rótulo "Salvar", e no submit encadeia o salvamento do horário quando a aba tem alteração pendente (incluindo o fluxo de ciência legal já existente).
- `src/lib/dp/__tests__/clt-alertas.test.ts`: casos novos — intermitente adulto com 60h/semana e sem folga não gera aviso; intermitente menor após 22:00 gera; CLT mantém todos os avisos atuais; folga variável não gera aviso de domingo.
- Freelancer: novo `src/components/dp/RegimeIntermitenteInfoDialog.tsx` (conteúdo explicativo, texto estático) e faixa de orientação renderizada em `ColaboradorFormDialog.tsx` sob o seletor de vínculo, com ação que muda o regime para `intermitente` e reaplica `contratoPolicy`. Texto de apoio derivado de `src/lib/dp/contrato-policy.ts`, sem mudança de schema nem de validação.

