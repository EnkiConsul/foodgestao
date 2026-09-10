# Condições de Trabalho: salvar por etapas, herdar padrão do cargo e definir a contagem

## 1. Salvar e continuar por aba

- Adicionar no rodapé o botão secundário **Salvar e continuar** nas abas editáveis: Contrato, Jornada, Pagamento e Benefícios.
- Ao clicar: valida a data de início e o motivo, salva e avança para a aba seguinte, mantendo a janela aberta.
- Em Benefícios, salvar leva para Histórico. Na aba Histórico não há salvar, apenas fechar.
- O botão principal **Aplicar mudança** continua salvando e fechando.
- Rodapé adaptado ao celular, com botões grandes empilhados, igual ao cadastro do colaborador.
- Proteção contra duplicidade: salvar mais de uma vez para a mesma data de início consolida a mesma vigência no histórico, em vez de criar várias linhas repetidas. Se nada mudou desde o último salvamento, a tela apenas avança.

## 2. Cargo manda no sindicato e no salário

Ao escolher um cargo já cadastrado:

- **Sindicato** e **salário base** passam a ser somente leitura, vindos do cadastro do cargo (piso da unidade), com aviso de que a mudança desses valores é feita no cadastro do cargo.
- Se o cargo não tiver salário cadastrado para a unidade, o campo fica editável com aviso de que falta o piso do cargo naquela unidade.

## 3. Padrão do cargo preenchido automaticamente

Ao escolher um cargo, os campos abaixo vêm preenchidos com o padrão dos colaboradores já cadastrados nesse cargo (o valor mais frequente, considerando a mesma unidade quando houver):

- Tipo de vínculo
- Setor habitual
- Jornada (turno padrão, horas por semana e dias/horários da semana)
- Forma de pagamento
- Benefícios (quais são concedidos e com quais valores)

O gestor pode ajustar qualquer um desses campos depois; o preenchimento é só um ponto de partida e não sobrescreve o que ele já editou manualmente.

## 4. Como fica a contagem de férias, 13º e tempo de casa

Nova pergunta obrigatória na aba Contrato, com duas opções:

- **Continuidade do contrato** (padrão para mudanças comuns: promoção, jornada, setor, unidade, benefícios): férias, 13º, tempo de casa e adicionais por tempo de serviço continuam contando a partir da admissão original.
- **Novo contrato** (usar quando o vínculo anterior é encerrado, por exemplo mudança de CLT para outro tipo de vínculo): o contrato anterior é encerrado na data informada e a contagem reinicia; férias, 13º e tempo de casa passam a contar da nova data. O período anterior fica preservado no histórico e o colaborador continua com acesso aos documentos antigos pelo portal.

Ao escolher "Novo contrato", a tela mostra em texto simples o que será encerrado e o que reinicia, e pede confirmação antes de salvar. A troca de tipo de vínculo passa a sugerir "Novo contrato" automaticamente.

## Detalhes técnicos

- Tela: `src/components/dp/ColaboradorCondicoesDialog.tsx`; padrão de intenção `stay`/`close` reaproveitado de `ColaboradorFormDialog.tsx`.
- Sindicato/salário do cargo por `salarioCargoNaUnidade` (`src/lib/dp/cargoSalarios.ts`) e vínculo cargo-sindicato (`dp_sindicato_cargos`).
- Novo utilitário para derivar o padrão do cargo a partir de `dp_colaboradores`, `dp_colaborador_config_trabalho`/`dp_colaborador_config_dias` e `dp_colaborador_beneficios` (mais os padrões já existentes em `dp_beneficios_padroes`), com testes.
- `dp_colaborador_aplicar_condicao`: consolidar a vigência por (colaborador, data de início) e receber o modo de continuidade; no modo "novo contrato", encerrar o período anterior e reiniciar a base de contagem usada por férias (`dp_ferias_periodos`), 13º e adicional por tempo de serviço, preservando documentos e histórico.
- Dados pessoais e preferências do colaborador (ex.: adiantamento) seguem fora desta tela.

## Verificação

- Verificação de tipos e testes existentes, mais testes do padrão do cargo e da recontagem.
- Navegador: percorrer as quatro abas com Salvar e continuar; conferir sindicato/salário travados pelo cargo, campos herdados do padrão, ausência de linhas duplicadas no histórico e o efeito das duas opções de contagem.
