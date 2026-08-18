# Alerta jurídico correto para o vínculo Sócio

## O que está acontecendo

Não, não está certo. No cadastro, os vínculos **PJ**, **Sócio** e **Autônomo** são gravados com o mesmo regime interno (`pj`), porque o banco não tem um valor próprio para sócio. O alerta jurídico é montado a partir desse regime interno, então o Sócio recebe exatamente o texto de **pejotização de PJ/MEI** — inclusive as sugestões "Mudar para Intermitente" e "Mudar para CLT", que não fazem sentido para quem é sócio da empresa.

O rótulo escolhido pelo usuário já é guardado (`vinculo_label`), então dá para distinguir os três casos sem mexer no banco.

## O que muda

O alerta passa a considerar o vínculo escolhido, não só o regime derivado:

- **Sócio**: deixa de exibir o alerta de pejotização. No lugar, uma orientação própria e mais curta: sócio é remunerado por **pró-labore/distribuição de lucros**, não entra na folha CLT; o ponto de atenção é o "sócio só no papel" — pessoa sem poder de gestão nem participação real nos resultados, cumprindo horário e ordens como empregado, o que pode ser reconhecido como vínculo de emprego. Sem atalhos "Mudar para CLT/Intermitente"; em vez deles, um aviso de que, se a pessoa atua como empregada, o registro correto é CLT.
- **PJ / MEI**: alerta de pejotização mantido exatamente como está hoje.
- **Autônomo**: mantém o alerta de risco, com o texto ajustado para autonomia (sem escala fixa, sem subordinação) em vez de falar de MEI desenquadrado.
- O reforço "Este cadastro tem horário e escala definidos…" continua aparecendo quando o cadastro tem horário/escala — inclusive para Sócio, pois é justamente o indício de subordinação.

O restante do comportamento não muda: nada bloqueia o cadastro, e a ciência formal do risco continua sendo exigida apenas para os vínculos sem registro em carteira que já a exigem hoje.

## Detalhes técnicos

- `src/lib/dp/regime-riscos.ts`: `EntradaRegimeRisco` ganha `vinculo` (rótulo canônico: `PJ`, `Socio`, `Autonomo`, `Freelancer`…). `RegimeRiscoTipo` ganha `socio` e `autonomo`; `atalhos` pode ficar vazio e o campo `verMaisLabel` fica opcional para o caso do sócio.
- `src/components/dp/ColaboradorFormDialog.tsx`: passa `vinculo: form.tipo_vinculo` para `regimeRisco`, e o `RegimeRiscoDialog` recebe o novo `tipo`.
- `src/components/dp/RegimeRiscoDialog.tsx`: conteúdo explicativo para `socio` (pró-labore, distribuição de lucros, risco do sócio sem gestão) e para `autonomo`.
- Testes unitários cobrindo: Sócio não retorna o texto de pejotização, PJ/MEI continuam retornando, e Sócio não oferece atalhos de mudança de regime.
