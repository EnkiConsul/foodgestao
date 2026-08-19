# Cadastro do colaborador: ações nas abas, riscos separados e ficha completa

## 1. Salário não carregava (Wanderson)

Verificado no banco: o registro do Wanderson está com `salario_base`, `valor_hora` e `base_salarial` **nulos** — não é falha de carregamento, o cadastro nunca teve valor gravado. O cargo dele (MOTOQUEIRO) tem salário de referência de R$ 1.750,00 no piso por sindicato patronal.

Correção: ao abrir a aba Remuneração de um colaborador **sem salário informado**, o sistema preenche o campo com o salário de referência do cargo/unidade e mostra um aviso "sugerido pelo cargo — confirme o valor". Nada é gravado sem o usuário salvar. Se não houver referência, o campo fica vazio com aviso de pendência (comportamento atual).

## 2. Horário de trabalho: não inventar horário incompatível

Hoje, quando não existe nenhum colega no mesmo cargo, a sugestão cai para o horário mais usado de toda a unidade — foi assim que o Wanderson (motoqueiro noturno) recebeu um horário diurno.

Correção: a sugestão automática passa a valer **somente quando há colega no mesmo cargo e unidade**. Sem correspondência cargo+unidade, os campos ficam **vazios** (sem o padrão 08:00–17:00) com a mensagem "nenhum horário compatível encontrado para este cargo nesta unidade — informe o horário". Os atalhos por nome de colega continuam disponíveis para copiar manualmente.

## 3. Insalubridade e periculosidade em campos separados

Hoje existe um único campo "Adicional insalubridade/periculosidade (%)".

Passa a ter dois blocos independentes:
- **Insalubridade** — percentual (grau mínimo 10%, médio 20%, máximo 40%), calculado sobre o salário mínimo, com atalhos dos graus.
- **Periculosidade** — percentual (padrão legal 30%), calculado sobre o salário base.
- Aviso quando os dois estão marcados: a lei não permite cumular; é preciso optar por um (art. 193 §2º CLT).
- O cargo passa a distinguir "insalubre" e "perigoso" em vez do único indicador atual, e a marcação do cargo sugere o bloco correspondente na ficha.

## 4. Desligamento, acesso ao portal e remover dentro do cadastro

O cadastro ganha duas novas abas e um menu de ações no cabeçalho:
- **Aba Desligamento** — data da demissão, motivo, elegibilidade para recontratação, observações, prévia do impacto (folgas/solicitações a cancelar, prazo de acesso ao portal) e os botões Registrar desligamento / Editar desligamento / Reintegrar. O diálogo separado deixa de ser necessário; a ação na lista passa a abrir o cadastro nessa aba.
- **Aba Acesso ao portal** — situação do vínculo de login, CPF de acesso, gerar acesso, redefinir senha, exibição da senha temporária e prazo de carência após o desligamento.
- **Cabeçalho do cadastro** — menu de ações com "Remover colaborador" (com confirmação), além dos atalhos de desligamento e acesso.

A lista de colaboradores mantém os atalhos, mas apontando para as abas do cadastro.

## 5. Ficha resumo completa e com cabeçalho fixo

A ficha aberta ao clicar na linha passa a mostrar **tudo o que existe no cadastro**, nas mesmas seções das abas:
- Identificação, contato e vínculo (como hoje).
- **Horário de trabalho** — dias trabalhados com entrada/saída/intervalo por dia, folga fixa ou variável, carga semanal, turno/horário de referência e origem (horário da loja ou próprio).
- **Remuneração completa** — forma de pagamento, salário, valor-hora e base de cálculo, insalubridade e periculosidade separadas, prêmio de assiduidade com critérios, vale-transporte, **vale-alimentação** (valor, periodicidade, dias-base, desconto) e demais benefícios da ficha com valor e desconto.
- **Dependentes** — lista com data de nascimento, IRRF e salário-família.
- **Documentos de admissão** — checklist com entregues e pendentes.
- **Sindicatos e enquadramento**, adicional por tempo de serviço, e **desligamento** quando houver.

Layout: cabeçalho **fixo** (sticky) com nome, badges de situação/perfil e os botões **Editar** e **X (fechar)** sempre visíveis; o rodapé duplicado sai. O corpo rola sob o cabeçalho e o botão Editar abre o cadastro na aba correspondente à seção.

## Detalhes técnicos

Banco:
- `dp_colaboradores`: `insalubridade_percentual`, `periculosidade_percentual` (numéricos, 0–100). `adicional_percentual` é mantido e passa a ser preenchido pela soma vigente para não quebrar a apuração da folha e as funções SQL que já o consomem.
- `dp_cargos`: `insalubre` e `perigoso` booleanos; `insalubre_periculoso` continua sincronizado por padrão para compatibilidade com a trava de menores de 18 anos.
- Backfill: percentual atual migra para insalubridade quando o cargo é insalubre, senão para periculosidade.

Frontend:
- `RemuneracaoFields.tsx`: blocos separados de insalubridade/periculosidade, prévia dos valores e aviso de não cumulação; prefill do salário de referência.
- `ColaboradorJornadaPanel.tsx` + `modeloHorarioRanking.ts`: sugestão restrita a cargo+unidade, estado "sem horário compatível" e horário inicial vazio.
- `ColaboradorFormDialog.tsx`: novas abas `desligamento` e `acesso`, menu de ações no cabeçalho (remover), reaproveitando a lógica de `DesligamentoDialog.tsx` e os handlers de acesso hoje em `DpColaboradores.tsx`.
- `ColaboradorFichaDialog.tsx`: cabeçalho sticky com Editar/X, seções novas alimentadas por `useDpColaboradorConfigTrabalho`, `useDpBeneficios`, `useDpDependentes`, `useDpDocumentos` e `useDpAdicionaisTempoServico`.
- `DpColaboradores.tsx`: ações da linha/menu passam a abrir o cadastro na aba certa.
- Testes unitários para a sugestão de horário restrita ao cargo e para o cálculo de insalubridade/periculosidade.
