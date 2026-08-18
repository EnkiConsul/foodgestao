# Padrão de benefícios por unidade + correção do piso salarial

## 1. Padrão de remuneração/benefícios por unidade

Objetivo: a partir do primeiro colaborador cadastrado, os demais cadastros da mesma unidade já vêm pré-preenchidos com assiduidade, tolerância, vale-alimentação, vale-transporte e demais benefícios.

Como vai funcionar:

- Ao salvar a aba **Remuneração** de um colaborador, o sistema pergunta uma única vez: "Usar estes valores como padrão da unidade X?" (com opção "não perguntar de novo").
- O padrão fica salvo por unidade (cada unidade pode ter negociação/benefício diferente). Se a unidade não tiver padrão, cai no padrão da empresa.
- Em um **novo** colaborador, ao escolher a unidade, os campos de benefícios vêm preenchidos com o padrão, com um aviso discreto "sugerido pelo padrão da unidade — pode ajustar". Nada é sobrescrito em colaborador já existente.
- Tela de gestão: em **Cadastros > Configurações do DP** (por unidade), um bloco "Padrão de benefícios" para editar/limpar o padrão sem depender de um colaborador.

Campos cobertos: prêmio de assiduidade (tipo, valor, critério, tolerância em minutos, máximo de atrasos), vale-alimentação (valor, periodicidade, origem dos dias, desconto), vale-transporte (valor/dia) e os demais benefícios já existentes na aba Remuneração.

## 2. Correção: erro ao salvar o piso do sindicato patronal

O que foi verificado no banco: existe 1 piso gravado para o cargo (patronal, vigência desde 21/03/2026, sem fim). O banco tem índice único que impede um segundo piso aberto para o mesmo cargo + patronal — por isso a segunda tentativa de "Adicionar" falha, e a mensagem atual só diz "Não foi possível salvar", sem explicar.

Correções:

- Quando já existir piso aberto para o mesmo cargo + patronal, o formulário deixa de oferecer "Adicionar" e passa a oferecer **"Novo reajuste"**: o sistema encerra a vigência do piso anterior (dia anterior à nova vigência) e grava o novo, mantendo o histórico. Mesma regra para o ajuste por unidade.
- Bloqueio de duplo clique/duplo envio no botão de salvar.
- Mensagens de erro reais do banco exibidas ao usuário (violação de unicidade, valor abaixo do piso, vigência inválida), em português.
- O painel de salário passa a mostrar também pisos **futuros e encerrados** (hoje só aparecem os vigentes), para o usuário entender por que o patronal não está mais disponível na lista.

Sobre a pergunta de "salvar padrão" que apareceu duas vezes: a causa não está confirmada (não há esse diálogo no cadastro de cargos hoje). Primeira etapa da correção: reproduzir o fluxo na tela de cargos para identificar qual diálogo é e garantir que ele apareça uma única vez por salvamento.

## Detalhes técnicos

- Nova tabela `dp_beneficios_padroes` (`company_id`, `unidade_id` nullable = padrão da empresa, `payload jsonb`, auditoria), com GRANTs, RLS (leitura para membros, escrita para admin/owner) e trigger de isolamento de empresa/unidade; índice único por (company_id, unidade_id).
- Hooks `useDpBeneficiosPadrao` / `useSalvarDpBeneficiosPadrao`; aplicação do padrão em `RemuneracaoFields.tsx` apenas quando o colaborador é novo e os campos ainda estão intocados.
- `CargoSalariosUnidadePanel.tsx`: fluxo de reajuste com encerramento de vigência, estado de envio, exibição de histórico e mapeamento de erros do Postgres.
- Testes unitários para a resolução do padrão de benefícios e para o encerramento de vigência do piso.
