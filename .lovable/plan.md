# Cadastro de Sócio: Sem Turno, Folga Livre e Remuneração Própria

Hoje o vínculo "Sócio" é apenas um rótulo (`vinculo_label = 'Socio'`) sobre o regime `pj`: o sistema trata o sócio igual a um PJ — pede horário de trabalho, aplica as travas de folga do autoatendimento e não distingue pró-labore de distribuição de lucros. Este plano dá ao sócio um comportamento próprio.

## O Que Muda

**1. Sócio não precisa de turno/horário**
- A aba "Horário" deixa de ser obrigatória para sócio: nenhuma pendência, nenhum alerta de carga semanal, nenhuma folga semanal exigida.
- A aba continua acessível (o gestor pode registrar um horário de referência), mas com aviso de que o sócio não tem jornada contratual.
- Sócio sai da conformidade DSR e da geração automática de escala; na ficha resumo o card de jornada mostra "Sem jornada contratual (sócio)" quando nada foi cadastrado.

**2. Sócio marca folga e férias livremente**
- As travas de autoatendimento (teto de folgas de fim de semana, dia de folga fixa, reserva de aniversariante) passam a não valer para sócio.
- Bloqueios administrativos de data e limite diário da unidade continuam valendo, para não furar a operação.
- Férias do sócio são apenas marcação no calendário: sem período aquisitivo, sem saldo de dias e sem alerta de férias vencidas. A tela de Férias passa a não listar sócios em Períodos.

**3. Remuneração do sócio: pró-labore ou somente lucros**
- Novo campo na aba Remuneração, visível só para sócio: **Forma de remuneração** com as opções "Pró-labore" e "Somente participação de lucros".
- Com **pró-labore**: valor mensal informado; o bloco mostra que não há 13º, férias, FGTS nem adiantamento.
- Com **somente lucros**: os campos salariais ficam ocultos e o bloco explica que não há remuneração fixa registrada.
- Benefícios (VA/VT) e complementos CLT (assiduidade, tempo de serviço, salário-família) não aparecem para sócio.

**4. Conferência de documentos**
- Sócio com **pró-labore**: o sistema espera apenas o **recibo de pró-labore** do mês. Nada de contracheque, 13º, férias ou folha de ponto.
- Sócio com **somente lucros**: nenhuma pendência de documento é gerada em nenhuma competência.
- Marcar férias de um sócio deixa de gerar pendência de "contracheque de férias".
- Novo tipo de documento "Recibo de Pró-Labore" no catálogo, com palavras-chave para o reconhecimento automático na importação.

## Detalhes Técnicos

- `src/lib/dp/contrato-policy.ts`: `contratoPolicy(regime, vinculoLabel?)` passa a resolver uma política `SOCIO` (derivada de `PJ_LIKE`) com `folgaSemanal: "nao_se_aplica"`, `exigeJornada: false` (nova flag), `participaConformidadeDsr: false`, `participaEscalaAutomatica: false`, `entraEmFolha: false`, `isentoRegrasFolga: true` (nova flag) e `feriasComPeriodoAquisitivo: false` (nova flag). Chamadores que só têm o regime continuam funcionando; os que têm o rótulo passam a informá-lo (`ColaboradorFormDialog`, `ColaboradorJornadaPanel`, `ColaboradorFichaDialog`, `DpConformidadeDsr`, `DpEscalas`, `DpColaboradores`).
- Migração em `dp_colaboradores`: coluna `socio_remuneracao text` com check `('pro_labore','somente_lucros')`, mais trigger de validação que exige o valor quando `vinculo_label = 'Socio'` e o proíbe nos demais vínculos.
- Migração em `dp_folgas_validar_unificado`: lê `vinculo_label` do colaborador e pula o bloco 5 (regras de autoatendimento) quando o vínculo é sócio.
- `dp_documento_tipo` ganha o valor `pro_labore`; `src/lib/dp/documentoTipos.ts` recebe a entrada com natureza Remuneração e keywords ("pró-labore", "prolabore", "recibo de pro labore").
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: passa a ler `vinculo_label` e `socio_remuneracao`; para sócio, substitui a lista de checks por `[["pro_labore", socio_remuneracao === 'pro_labore']]` e ignora os gozos de férias.
- `src/components/dp/RemuneracaoFields.tsx`: novo seletor condicional e ocultação dos blocos CLT/benefícios quando o vínculo é sócio; `ColaboradorFormDialog` mapeia o campo no payload e ajusta as validações da aba Horário e Remuneração.
- `src/pages/dp/DpFeriasHub.tsx` / períodos: filtra sócios da listagem de períodos aquisitivos e do alerta de vencimento.
