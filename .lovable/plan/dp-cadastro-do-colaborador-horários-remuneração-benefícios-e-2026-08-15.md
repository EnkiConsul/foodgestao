# DP — Cadastro do colaborador: horários, remuneração, benefícios e sindicato

Plano em 5 fases. Cada fase é entregável por si, na ordem abaixo.

## Fase 1 — Horário de Trabalho (correções de bug)

**O que está errado hoje (verificado no código):**
- A folga fixa semanal fica na aba **Dados** (campo `folga_fixa_semana` do colaborador) e a aba **Horário de Trabalho** deriva a folga apenas dos switches dos dias — as duas fontes não conversam, então o valor salvo em Dados nunca aparece no horário.
- Ao copiar de outro colaborador, a consulta do diálogo lê só `dow, trabalha, turno_id` dos dias — os horários por dia (`entrada`, `saida`, `intervalo_minutos`) simplesmente não são buscados, por isso as exceções se perdem.
- Salvar o Horário de Trabalho passa pelas validações de remuneração do cadastro (salário obrigatório), travando a edição de uma aba por falta de dado de outra.

**Correções:**
1. Mover o campo Folga Fixa Semanal para a aba Horário de Trabalho, com fonte única: os switches dos dias da semana. O valor continua gravado em `dp_colaboradores.folga_fixa_semana` (derivado dos dias), e a aba Dados passa a mostrar só leitura + link "editar no Horário de Trabalho".
2. Redesenhar a lista de dias: cada dia já mostra **entrada, saída e intervalo** editáveis (sem o switch "cadastrar horário diferente"), mais um botão **Copiar para outros dias** ao lado do dia, que abre a lista dos demais dias para marcar quais repetem aquele horário.
3. Corrigir o diálogo "Copiar de outro colaborador" para trazer os horários por dia e aplicá-los; a lista de colegas passa a mostrar o resumo do horário.
4. "Horários já usados na loja": em vez de faixas de horário, listar **o nome do colaborador** que usa cada horário distinto; clicar copia o horário dele.
5. Salvamento por aba: cada aba grava a sua parte. Pendências das outras abas viram aviso ("faltam dados de Remuneração para gerar a folha"), com atalho para a aba, sem bloquear o salvamento do que foi editado. As validações que travam continuam apenas para os dados essenciais do próprio registro (nome, CPF, cargo, unidade, datas).
6. Trocar o `window.confirm` do salário de referência do cargo por diálogo do próprio sistema (mesmo padrão do `CargoSalarioConflitoDialog`).

## Fase 2 — Remuneração: assiduidade e vale-alimentação

**Assiduidade**
- Prêmio passa a aceitar **valor fixo (R$) ou percentual (%) do salário**, com prévia do valor calculado.
- "Máximo de atrasos no mês" deixa de ficar desabilitado por critério: é sempre editável e definido pela empresa, junto com a tolerância em minutos por dia.

**Vale-alimentação / vale-refeição**
- Campos: valor **diário ou mensal**, dias considerados no mês, e o desconto do colaborador em **percentual ou valor**.
- Regra jurídica aplicada: alimentação fornecida via PAT ou por CCT/ACT tem natureza indenizatória; se a empresa não desconta nada e o pagamento vira habitual e em dinheiro, cresce o risco de o valor ser tratado como salário (integrando INSS, FGTS, 13º e férias). Quando o desconto for zero, o sistema mostra alerta explicando o risco e recomendando desconto simbólico (praxe de mercado: 1% a 20%) ou previsão em norma coletiva — sem bloquear o cadastro, registrando a ciência no histórico de regras.
- Vale-transporte mantém o teto legal de 6% do salário base já implementado.

## Fase 3 — Benefícios: padrão, isonomia e termo de dispensa

- Ao cadastrar um **novo colaborador**, os benefícios já usados na empresa vêm **marcados por padrão** (valor e desconto padrão do catálogo), cabendo ao usuário desmarcar.
- Ao **desmarcar** um benefício que outros colegas do mesmo cargo/unidade têm, o sistema alerta sobre isonomia (art. 461 da CLT e princípio da não discriminação): benefício concedido de forma habitual a colegas em situação equivalente pode ser exigido judicialmente; a diferença precisa de motivo objetivo (norma coletiva, adesão voluntária, condição do benefício) ou de manifestação do colaborador.
- O sistema gera um **termo de dispensa/não adesão** ao benefício, em documento imprimível (mesmo padrão do holerite), pronto para colher assinatura. O termo fica anexado ao histórico do colaborador.
- Nova tela **Cadastro → Benefícios** (visão sintética), com catálogo, ficha por colaborador, valores, descontos e quem está sem cada benefício — na mesma arquitetura da tela derivada de Jornada.

## Fase 4 — Cargos e telas sintéticas derivadas

- Tela **Cargos** passa a editar e exibir **salário base de referência** e a marca de insalubridade/periculosidade (campos que já existem na tabela `dp_cargos` mas não aparecem no formulário nem na visualização).
- Na ficha do cargo, lista dos **colaboradores naquele cargo**, com botão que abre o cadastro do colaborador para edição.
- Novas telas sintéticas em Cadastro, todas gravando nas mesmas tabelas do cadastro do colaborador (fonte única, sem duplicar regra):
  - **Horários de Trabalho** (por unidade/colaborador) — já existe como painel, ganha a visão de lista.
  - **Benefícios** (Fase 3).
  - **Remuneração** — salário, forma de pagamento, assiduidade por colaborador.
- O cadastro do colaborador continua sendo a visão analítica; as telas de Cadastro são a visão sintética, e ambas leem/escrevem os mesmos registros.

## Fase 5 — Aba Sindicatos no colaborador

- Nova aba **Sindicatos** no cadastro do colaborador, com os mesmos campos da tela de Sindicatos (nome, CNPJ, tipo patronal/laboral, data-base, contato).
- O usuário pode escolher sindicatos já cadastrados ou criar na hora; o criado aparece imediatamente na tela de Sindicatos.
- Regra travada: numa mesma unidade, um cargo não pode ter dois sindicatos patronais nem dois laborais diferentes. Se o vínculo escolhido conflitar com o já existente para aquele cargo+unidade, o sistema mostra o conflito e oferece corrigir o vínculo existente ou trocar o do colaborador.

## Detalhes técnicos

Banco (migrações):
- `dp_beneficios`: `periodicidade` (diário/mensal), `dias_base`, `desconto_tipo` (percentual/valor/nenhum), `desconto_valor_fixo`.
- `dp_colaborador_beneficios`: `desconto_tipo`, `desconto_percentual`, `dispensado_pelo_colaborador`, `termo_gerado_em`.
- `dp_colaboradores`: `premio_assiduidade_tipo` (valor/percentual), `va_valor`, `va_periodicidade`, `va_desconto_tipo`, `va_desconto_valor`.
- Índice/constraint de unicidade lógica para sindicato por cargo+unidade+tipo, validada por função e checada na UI.

Frontend:
- `ColaboradorJornadaPanel.tsx`: novo editor por dia (entrada/saída/intervalo sempre visíveis) + ação "copiar para outros dias"; folga fixa integrada; atalhos por nome de colaborador.
- `CopiarConfigColaboradorDialog.tsx`: incluir `entrada, saida, intervalo_minutos` no select dos dias.
- `ColaboradorFormDialog.tsx`: salvamento por aba com avisos não bloqueantes; diálogo interno no lugar de `window.confirm`.
- `RemuneracaoFields.tsx`: assiduidade valor/percentual, limite de atrasos livre, bloco de vale-alimentação com regra de desconto e alerta jurídico.
- Novas telas em `src/pages/dp/cadastros/` (Benefícios, Remuneração, Horários) + rotas e itens no hub e na navegação do DP.
- Regras puras em `src/lib/dp/`: `beneficios-regras.ts` (desconto, isonomia, termo), `assiduidade.ts`, `sindicato-regras.ts`, com testes unitários.
