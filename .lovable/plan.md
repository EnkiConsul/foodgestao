# Horário de Trabalho: alertas certos por vínculo e um só botão de salvar

Quatro ajustes na aba "Horário de Trabalho" do cadastro do colaborador.

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
