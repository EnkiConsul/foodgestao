
# Jornada única com interpretação por tipo de contrato — análise e proposta

## O que confirmei no projeto hoje

- **Não existe módulo de Convocação.** Nenhum arquivo, tabela ou rota trata de convocação — é funcionalidade nova, não um ajuste.
- **O tipo de vínculo do colaborador não tem "Intermitente".** `ColaboradorFormDialog` oferece CLT, Sócio, Estagiário, PJ, Autônomo, Temporário, e mapeia para o enum de regime do banco (`clt, pj, estagio, temporario, mei`) — que também não tem intermitente.
- **"Intermitente" hoje existe apenas como tipo de escala da Jornada** (`dp_tipo_escala`), ou seja, num nível errado: é propriedade do contrato do colaborador, não do modelo de horários.
- **O motor de carga já é neutro o suficiente:** `folgasPorRegime` devolve "indefinido" para intermitente, e depois do último ajuste a validação de 44h não acontece mais no cadastro da jornada — ela ocorre no vínculo (quando há folga fixa) e na escala gerada.

## Avaliação da proposta

**Concordo com o conceito central.** Manter um único objeto "Jornada" = padrão esperado de trabalho, com interpretação variando pelo contrato, é a modelagem correta e é a que menos machuca a arquitetura atual. Renomear para "Disponibilidade" seria pior, como você mesmo apontou.

**Vantagens**
- Fluxo único de cadastro; nenhuma bifurcação de UX para o dono do restaurante.
- Reaproveita `dp_jornadas` + `dp_jornada_horarios` sem tabela nova.
- Jornada vira modelo reutilizável que acelera muito a criação de convocações e escalas.
- Escalável: qualquer contrato futuro (aprendiz, temporário, 12x36) só precisa declarar como interpreta o padrão.

**Riscos e correções necessárias**
1. **O eixo de decisão precisa ser o contrato, não a jornada.** Hoje "intermitente" está no `tipo_escala` da jornada. Se ficar assim, uma mesma jornada usada por um CLT e por um intermitente se comporta igual para os dois. A regra tem que ler o **regime do colaborador**. Proponho: adicionar `intermitente` ao enum de regime, expor "Intermitente" no Tipo de Vínculo, e depreciar o valor `intermitente` do `tipo_escala` (mapeando para `personalizada`).
2. **Jornada não é obrigação — precisa ficar registrado no dado, não só no texto.** Se a jornada do intermitente entrar nos mesmos relatórios de conformidade/DSR do CLT, geramos passivo (folga semanal, DSR, 44h para quem não tem jornada contratada). Toda leitura de conformidade precisa excluir intermitentes por regime.
3. **A CLT exige coisas que a proposta não cobre** e que valem constar como requisitos do módulo de Convocação (fase seguinte): convocação com no mínimo 3 dias corridos de antecedência, aceite/recusa em até 1 dia útil (silêncio = recusa), registro do período e do valor combinado, e multa contratual em caso de descumprimento após aceite. Sem convocação registrada e aceita, não há hora a pagar — logo **folha e ponto do intermitente devem se basear na convocação aceita, nunca na jornada**.
4. **Descanso semanal do intermitente existe** (proporcional/embutido no pagamento do período convocado). Não valide folga semanal contra a jornada, mas não afirme na UI que "não há folga".
5. **Ponto (módulo futuro):** o esperado do dia vem da convocação aceita; para CLT vem da jornada. Precisa ser um único ponto de resolução, senão o motor de ponto nasce duplicado.

**Alternativa mais simples que avaliei e descartei:** criar uma tabela `dp_disponibilidades` separada. Duplicaria editor de horários, hooks e UI mobile para um ganho conceitual mínimo. Sua proposta é superior.

**Alternativa que recomendo incorporar:** em vez de espalhar `if (regime === 'intermitente')` pela UI, criar **um único resolvedor de política de contrato** — dado o regime, ele responde: valida 44h? exige folga semanal? entra na conformidade DSR? entra na escala automática? jornada é sugestão ou obrigação? Toda tela consulta esse resolvedor. Isso é o que torna a modelagem realmente escalável para contratos futuros.

---

## Plano de implementação (após sua aprovação)

### Fase 1 — Fundação de contrato (base para tudo)
- Migração: adicionar `intermitente` ao enum de regime de trabalho.
- Novo módulo de domínio `src/lib/dp/contrato-policy.ts` com a política por regime (valida carga semanal, exige folga semanal, participa de DSR/conformidade, jornada obrigatória vs. sugerida, rótulos de UI).
- Testes unitários da política.

### Fase 2 — Cadastro do colaborador
- Adicionar "Intermitente" ao Tipo de Vínculo.
- Quando intermitente: ocultar Folga semanal e carga semanal prevista; manter a Jornada visível, com o rótulo "Disponibilidade habitual".

### Fase 3 — Jornada e vínculo
- Cadastro de Jornada permanece idêntico; o `tipo_escala` "intermitente" deixa de ser oferecido (dados existentes seguem lendo como personalizada).
- No vínculo (`ColaboradorJornadaDialog`) de um colaborador intermitente: banner "Esta jornada representa a disponibilidade habitual do colaborador. A carga efetiva será calculada pelas convocações realizadas."; sem folga fixa, sem alerta de 44h.

### Fase 4 — Escalas e conformidade
- Gerador de escala e validação de 44h passam a ignorar intermitentes (via política).
- Ao adicionar um intermitente na escala: mostrar "Disponibilidade sugerida HH:MM–HH:MM" com ações **Usar horário sugerido** / **Editar horário**.
- Relatórios de conformidade DSR excluem intermitentes.

### Fase 5 — Convocações (novo módulo, escopo próprio)
- Tabela `dp_convocacoes` (colaborador, data, entrada/saída/intervalo, status, prazos de aceite, origem da sugestão) com RLS e grants por empresa.
- Criação de convocação pré-preenchida pela jornada do dia, com horários editáveis; convocação nunca altera a jornada.
- Aceite/recusa pelo portal do colaborador, com prazo e regra de silêncio = recusa; base de horas para escala publicada, ponto e folha.

### Notas técnicas
- Nenhuma tabela nova nas fases 1–4; apenas um valor de enum e código de domínio.
- Toda decisão de comportamento passa pelo resolvedor de política — proibido `if regime === ...` espalhado nas telas.
- Mobile: nenhuma tela nova nas fases 1–4; apenas supressão de campos e um banner, o que reduz altura do formulário.

Confirmando esta análise, começo pela Fase 1. Se preferir, entrego Fases 1–4 primeiro e tratamos Convocações como projeto separado — é o corte que recomendo.
