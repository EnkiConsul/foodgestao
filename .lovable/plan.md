# Pessoas 360 — Fechamento da Fase 3 (Plano Mestre)

## Onde estamos

Do Plano Mestre de revisão do Pessoas 360, já foram entregues:

- **Fase 1** — correções críticas da Rotina do Dia e da Jornada (Dia OK, setor de folguista, troca de folga, horário de funcionamento).
- **Fase 2** — visão unificada: abas Todos | Colaboradores | Folguistas | Em Teste, Transformar em Colaborador, setor habitual e rotina Por Setor/Por Cargo.
- **Fase 3 (parcial)** — textos que citavam folha de pagamento ajustados, menu de folha fora da navegação, Alterar Condições de Trabalho com vigência e histórico, freelancer sem obrigações de CLT (sindicato, adicional, isonomia), remuneração própria divergente do cargo, campo "Remuneração acordada" para freelancer, e Recontratar (novo vínculo) separado de Reintegrar (desfazer desligamento).

## O que falta para fechar a Fase 3

### 1. Formas de remuneração do freelancer (item 9.6)

Hoje só existem mensalista, horista e diarista. Ampliar para:

- valor fixo (mensal), por hora, por diária — já existem;
- **valor semanal**, **por turno** e **por serviço/acordo** — novos.

Como: estender a lista de formas de pagamento no banco e reutilizar a tela de remuneração já existente (sem criar um segundo sistema). Para "por turno" e "por serviço/acordo", o valor informado é apenas um acordo registrado — sem cálculo automático.

### 2. Varredura final dos critérios de aceite (item 9.10)

Conferir tela a tela que:

- nenhuma tela diz que o sistema gera Folha de Pagamento (restam telas antigas de folha acessíveis por endereço direto — avaliar bloquear o acesso com aviso "em desativação", sem apagar dados);
- Folha de Ponto continua funcionando normalmente;
- CLT segue com remuneração contratual obrigatória;
- freelancer não exige sindicato nem herda salário do cargo;
- mudança de regime/jornada preserva histórico com vigência;
- folguista/teste pode virar colaborador sem duplicar cadastro.

### 3. Testes e evidências

- Typecheck e testes do Pessoas 360.
- Validação visual no preview: cadastro de freelancer com cada nova forma de pagamento e telas conferidas nos critérios acima.

## Depois desta etapa

Encerrada a Fase 3, o Plano Mestre segue para os temas ainda não detalhados em fases: **Férias** (sem passivos históricos artificiais) e **usabilidade/mobile** (tabelas virando cards, portais do gestor e do colaborador). Esses entram como próximas fases, uma por vez, após sua aprovação.

## Detalhes técnicos

- Estender o enum `dp_forma_pagamento` com `semanal`, `por_turno` e `servico_acordo` (migração), com rótulos "Semanal", "Por turno" e "Por serviço/acordo".
- Atualizar `FORMA_PAGAMENTO_LABEL` e as opções por vínculo em `src/lib/dp/remuneracao.ts` e `src/lib/dp/contrato-policy.ts` (freelancer passa a aceitar as novas formas).
- `RemuneracaoFields.tsx`: campo de valor para as novas formas (valor semanal; valor por turno; valor do serviço/acordo), mantendo "Remuneração acordada" para freelancer.
- Verificar cálculos que dividem salário (valor-hora, adiantamento, VA/VT) para tratar as novas formas com segurança — freelancer já fica fora desses cálculos CLT.
- Rotas antigas de folha (`/dp/folha*`, `/dp/rescisoes`, provisões/relatórios de folha): em vez de apagar, exibir aviso de desativação ou bloquear acesso, preservando dados.
- Títulos em Iniciais Maiúsculas; erros de banco sempre traduzidos para mensagens amigáveis.
