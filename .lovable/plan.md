# Ficha única: Admissão e Colaborador na mesma tela

## Objetivo
A revisão da pré-admissão passa a abrir **a mesma ficha de cadastro manual do colaborador**, com todas as funções dela (sindicato e enquadramento, espelhar jornada de outro colaborador, piso do cargo na unidade, benefícios, dependentes, documentos). A única diferença visível é um selo **"Em Admissão"** e uma barra com as etapas da contabilidade.

## Como fica para o usuário
```text
[Em Admissão] Nathanaelly ...   Etapa: Revisão > Contabilidade > Retorno > Efetivado
 Abas: Dados | Horário de Trabalho | Remuneração | Dependentes | Documentos
 Rodapé: Salvar | Gerar Ficha Para A Contabilidade | Registrar Retorno | Efetivar Admissão
```
- Dados pessoais e documentos já vêm preenchidos pelo candidato; tudo continua editável.
- "Efetivar Admissão" só libera depois do retorno da contabilidade conferido (trava atual mantida).
- Após efetivar, a mesma ficha passa a mostrar o colaborador normal (sem o selo).

## Estrutura (recomendação aprovada)
- Tela única; dados continuam separados: a admissão fica como rascunho isolado até efetivar, sem aparecer em escalas, folgas, vales ou limites do plano.
- Na efetivação, tudo (dados, jornada, remuneração, benefícios, dependentes, documentos) é transferido de uma vez para o cadastro oficial.

## Detalhes técnicos
- `ColaboradorFormDialog` ganha modo `admissao` (prop `preadmissao`): carrega o formulário a partir de `dados` + `admin_dados` da pré-admissão; o salvar grava via ação `salvar_ficha` (dados pessoais/dependentes) e `salvar_admin` (cargo, unidade, sindicato, salário, jornada escolhida, benefícios) no servidor, nunca em `dp_colaboradores`.
- Horário de Trabalho: o painel de jornada funciona em modo "sem colaborador" guardando a configuração escolhida (incluindo espelho de outro colaborador) em `admin_dados.jornada`; aplicada na efetivação.
- Remuneração/benefícios/sindicato: reutiliza os mesmos hooks (piso por unidade, enquadramento, isonomia), guardando o resultado em `admin_dados`.
- Recontratação: se o CPF já existe como colaborador, a ficha abre com a remuneração/jornada já cadastradas como ponto de partida.
- Efetivação: estender `dp_preadmissao_efetivar` para aplicar `admin_dados.jornada`, benefícios e sindicato de forma atômica (migration reversível, pedirá sua aprovação).
- `PreadmissaoRevisaoDialog` vira um invólucro fino que abre a ficha única com a barra de etapas.
- Sem publicação; testes de tipo, build e navegação pela tela ao final.
