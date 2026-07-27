## Problema

A tela "Regras De Folgas" começa em **"Todas as unidades (padrão da empresa)"** e trata cada loja como "exceção". Na Pakerê isso não reflete a realidade: Garavelo e T-63 negociam com sindicatos patronais diferentes, então cada unidade tem regra própria — não existe padrão real de empresa.

## Nova lógica: regra por unidade, com opção de replicar

**1. Escopo passa a ser a unidade**
- O seletor lista apenas as unidades da empresa; a primeira (ou a última usada) já vem selecionada.
- Some a opção "Todas as unidades (padrão da empresa)" e a linguagem de "exceção".
- Empresa com uma única unidade: seletor oculto, edita direto aquela unidade.
- Ao lado do seletor, mostrar o sindicato patronal e a negociação vigente vinculados à unidade — deixa explícito por que as regras divergem entre lojas.

**2. Estado por unidade**
- Badge "Regras Configuradas" quando a unidade já tem regra própria.
- Badge "Ainda Não Configurada" quando não tem: campos pré-preenchidos com a base legal/CLT apenas como ponto de partida, com o aviso "Ajuste e salve para definir as regras desta unidade."

**3. Replicar ao salvar**
- Ao salvar, se houver mais de uma unidade, abre um passo: "Aplicar Estas Regras Também Em Outras Unidades?" — lista das demais unidades, nenhuma marcada por padrão, mais o botão "Salvar Somente Nesta Unidade".
- Unidades que **já têm regra própria** aparecem com aviso de que serão sobrescritas.
- Cada unidade marcada recebe seu próprio registro, e cada gravação entra no histórico identificando a unidade.
- Se a ciência legal for exigida (regra menos protetiva), ela aparece antes da gravação e vale para todas as unidades selecionadas.

**4. Substituir "Remover Exceção"**
- Vira "Limpar Regras Desta Unidade", com confirmação, visível só quando a unidade tem regra. Depois de limpar, volta ao estado "Ainda Não Configurada".

## Compatibilidade

- O registro de nível empresa continua existindo como **retaguarda invisível**: a resolução de regras já prioriza a unidade e cai para a empresa quando a unidade não tem regra, o que protege unidades criadas no futuro e as telas que leem a regra geral (Conformidade DSR, validação de menores, Escalas com filtro "todas as unidades").
- Esse registro passa a ser atualizado somente quando o usuário replica para todas as unidades; a tela nunca o edita diretamente.
- Escalas, calendário do colaborador e conformidade continuam resolvendo pela unidade primeiro; o motor de folgas não muda.

## Detalhes técnicos

- `src/hooks/useDpConfigDp.tsx`: novo `saveMany({ patch, unidadeIds, ciencia, justificativa })` gravando/atualizando uma linha por unidade, com histórico por unidade; `save` atual vira o caso de unidade única.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: seletor só de unidades com persistência da última escolha, badges de estado, bloco de contexto sindical, encadeamento do novo diálogo de replicação com o `CienciaLegalDialog`, e renomeação do botão de limpar.
- Novo `src/components/dp/ReplicarRegrasDialog.tsx` (checkboxes + marcação de sobrescrita).
- Contexto sindical reutilizando as consultas já existentes de `dp_sindicato_unidades` / `dp_sindicato_negociacoes`.
- Textos e badges em Title Case, seguindo o padrão do módulo DP.

## Verificação

- Garavelo: configurar regra por acordo coletivo e salvar só nela; T-63 mantém a própria regra.
- Replicar de Garavelo para T-63 com o aviso de sobrescrita e conferir os valores iguais nas duas.
- Limpar regras de uma unidade e conferir o estado "Ainda Não Configurada" e a resolução caindo na retaguarda.
- Conferir Escalas e Conformidade DSR lendo a regra correta por unidade e o histórico registrando cada gravação.
