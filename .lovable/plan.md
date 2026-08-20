# Cadastro de Cargos completo (janela, pisos editáveis e campos do cargo)

## 1. Janela de edição do cargo

- Trocar o diálogo atual (`max-w-md`, tudo rolando junto) por um layout de altura fixa:
  - Cabeçalho fixo com ícone, "Editar cargo" e o **nome do cargo em edição** (mais o número de colaboradores vinculados).
  - Corpo com rolagem **apenas vertical** (`overflow-y-auto`, `overflow-x-hidden`), largura maior (até ~3xl) e grades que quebram em 1 coluna no mobile — nenhum bloco interno com rolagem horizontal.
  - Rodapé fixo com "Cancelar" e "Salvar".
- Organizar o conteúdo em abas internas para não virar um formulário gigante: **Dados do cargo**, **Salários (pisos)**, **Riscos e base de cálculo**, **Requisitos**.

## 2. Campos do cargo (paridade com o cadastro do colaborador)

Todos os campos relacionados ao cargo passam a existir aqui, com os mesmos rótulos/validações usados na ficha do colaborador:

- Nome, descrição, CBO, ativo/inativo.
- **Riscos**: switch "insalubre ou perigoso" e, ao ligar, os mesmos campos da tela do colaborador — percentual de insalubridade (10/20/40% em atalhos) e percentual de periculosidade (30%), com o aviso de não cumulatividade (art. 193 §2º CLT).
- **Base de cálculo**: base de horas/mês (padrão 220) e base de dias/mês (padrão 30), usadas para valor-hora e valor-dia.
- **Requisitos**: exige CNH + categoria mínima, exige EPI.
- **Sindicato laboral do cargo**: mesmo vínculo hoje editado na tela de Sindicatos, agora também editável aqui (as duas telas gravam no mesmo lugar).
- Pisos salariais continuam no bloco de salários (piso por sindicato patronal + ajuste por unidade).

### Herança dos percentuais de risco

O cargo guarda o **padrão**; o colaborador herda ao cadastrar/trocar de cargo e pode ter valor próprio. Ao salvar o cargo com percentual alterado, o sistema pergunta se deve **aplicar aos colaboradores atuais** desse cargo (lista quantos serão afetados). Editar na ficha do colaborador continua valendo só para ele.

## 3. Edição dos pisos salariais já cadastrados

- Cada linha de piso (patronal e ajuste de unidade), inclusive as do histórico, ganha botão **Editar**.
- No diálogo de edição é possível alterar: valor, **data base (início de vigência)**, fim de vigência, escopo (sindicato patronal / unidade) e observação.
- **Justificativa obrigatória** (mínimo ~10 caracteres) para salvar qualquer alteração de piso.
- Validações mantidas: ajuste de unidade não pode ficar abaixo do piso do patronal na data, fim ≥ início, sem sobreposição de duas linhas em aberto no mesmo escopo.
- Log de alterações gravado com valores antigo e novo + justificativa, exibido em um bloco "Histórico de alterações" dentro do bloco de salários (quem, quando, o que mudou e por quê).

## 4. Detalhes técnicos

- Banco (migração):
  - `dp_cargos`: novas colunas `insalubridade_percentual numeric default 0`, `periculosidade_percentual numeric default 0`, `base_horas_mes numeric default 220`, `base_dias_mes numeric default 30`.
  - Log de piso reaproveita `dp_regras_historico` (`tabela='dp_cargo_salarios'`, `registro_id`, `valor_antigo`, `valor_novo`, `justificativa`) — mesmo padrão já usado por turnos e configurações do DP; nenhuma tabela nova.
- Frontend:
  - `src/pages/dp/DpCargos.tsx`: novo shell do diálogo (header/footer fixos, abas) e estado do formulário ampliado; a visualização passa a mostrar os novos campos.
  - Novo `src/components/dp/cargos/CargoFormDialog.tsx` para tirar o formulário da página e manter os arquivos pequenos.
  - Novo `src/components/dp/cargos/CargoSalarioEditDialog.tsx` (edição + justificativa) e ajustes em `CargoSalariosUnidadePanel.tsx` (botão editar, histórico de alterações).
  - Novo `src/components/dp/cargos/CargoRiscosFields.tsx` reutilizando a mesma lógica de `src/lib/dp/adicionais-risco.ts` já usada em `RemuneracaoFields.tsx`, para os campos serem literalmente os mesmos nas duas telas.
  - `src/hooks/useDpCadastros.tsx`: mutations para atualizar piso com justificativa/log, hook do log por cargo e propagação opcional dos percentuais aos colaboradores do cargo.
  - `src/lib/dp/cargoSalarios.ts`: helpers de validação da edição (sobreposição de vigências, piso mínimo na data) + testes unitários.
