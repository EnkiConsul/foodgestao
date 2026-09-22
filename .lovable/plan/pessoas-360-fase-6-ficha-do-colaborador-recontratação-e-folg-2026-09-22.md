# Pessoas 360° — Fase 6: Ficha do colaborador, recontratação e folgas por rotina oficial

Escolhi o bloco de maior exposição: a ficha do colaborador. Hoje o aplicativo
ainda grava direto nela (129 campos, incluindo salário, dados de pagamento,
vínculo de acesso e desligamento), além das folgas, registros disciplinares e
aceite de documento. E o caso da Cristiane mostra exatamente o prejuízo disso.

## Caso Cristiane — o que o sistema fez (conferido no banco)

- Desligamento gravado em 11/09; recontratação gravada em 17/09 às 21:45 pelo
  Gabriel, com admissão em 28/08 e vínculo Freelancer mensalista.
- A rotina de recontratação **reaproveita a mesma ficha**: limpou a data e o
  motivo do desligamento e **sobrescreveu a data de admissão**. O vínculo CLT
  anterior (admitida em 01/04/2017, desligada em 11/09/2026) deixou de existir
  na ficha — sobrou apenas no registro de auditoria.
- O histórico de condições tem **uma única linha**, a nova (vigência 28/08,
  Freelancer). O período CLT nunca foi registrado ali, então o fechamento do
  período anterior não teve o que fechar.
- A configuração de trabalho (turno, jornada, dias) **não foi tocada**: segue
  vigente desde 01/04/2017 com o desenho do contrato CLT. É por isso que a ficha
  continua se comportando como CLT efetivo mesmo com o vínculo Freelancer salvo.

## O que muda para quem usa

- **Recontratação passa a abrir um novo vínculo de verdade**: o período anterior
  é fechado com as datas reais de admissão e desligamento e fica visível no
  histórico da pessoa; o novo vínculo começa na data informada, com seu tipo,
  cargo, unidade, remuneração e sua própria configuração de trabalho (turno,
  jornada e dias), coerente com o novo tipo de vínculo.
- A ficha mostra os vínculos em ordem ("CLT — 01/04/2017 a 11/09/2026",
  "Freelancer mensalista — desde 28/08/2026"), e tempo de casa, férias e
  benefícios passam a olhar o vínculo vigente.
- O caso da Cristiane é corrigido: o período CLT é reconstruído com as datas
  reais (sem apagar nada) e a configuração de trabalho do vínculo antigo é
  encerrada em 11/09, com a nova valendo a partir de 28/08.
- Admitir, alterar e desligar passa a ser uma operação única no servidor: ou
  grava tudo, ou nada. Clique repetido não duplica.
- Campos sensíveis (salário, dados de pagamento, vínculo do acesso, situação e
  desligamento) só mudam pela rotina oficial, com registro de quem mudou.
- Folga criada, cancelada ou remarcada pelo gestor sempre passa pelas conferências
  (data passada, bloqueios, limite do dia, folga repetida) — nada entra por fora.
- Registro disciplinar e aceite de documento deixam de aceitar gravação direta.

## Escopo técnico

Verificado no banco antes do plano: `dp_recontratar_colaborador` sobrescreve
`data_admissao` e limpa `data_desligamento` na própria linha de
`dp_colaboradores`, fecha histórico apenas de linhas já existentes e ignora
`dp_colaborador_config_trabalho`; `dp_colaboradores` tem política `ALL`
(`dp_colab_admin_write`) com INSERT/UPDATE/DELETE para `authenticated`;
`dp_folgas` tem `dp_folgas_admin_write` (ALL) além da autoinserção restrita do
colaborador; `dp_registros_disciplinares` tem `dp_disc_write` (ALL);
`dp_documento_aceites` ainda aceita INSERT direto do administrador.
`dp_portal_access_tokens` já está fechado (política `false`).

1. **Vínculos como histórico de primeira classe**
   - `dp_recontratar_colaborador` reescrito: fila por colaborador (advisory lock);
     fecha o período anterior em `dp_colaborador_historico_condicoes` criando a
     linha do vínculo antigo quando ela não existe (datas reais de admissão e
     desligamento, condições atuais da ficha); encerra a configuração de trabalho
     vigente em `dp_colaborador_config_trabalho`/`_config_dias` na data do
     desligamento e cria a nova a partir da nova admissão conforme o tipo de
     vínculo; preserva `data_admissao` original no histórico; idempotente.
   - Campos derivados (tempo de casa, direito a férias, benefícios) leem o
     vínculo vigente — `src/lib/dp/` ajustado onde hoje usa `data_admissao` da
     ficha como "início de tudo".
   - Correção de dados da Cristiane por script transacional, sem apagar nada.
2. **Rotinas oficiais** (SECURITY DEFINER em `public`, EXECUTE só para
   `authenticated`/`service_role`): `dp_colaborador_salvar` (ficha + condições +
   histórico numa transação, versão para duplo clique, conferências de empresa/
   unidade/cargo/setor/turno, Pix CPF ou celular, titular próprio, sócio,
   menores, CPF duplicado), `dp_colaborador_desligar`/reativar (mantendo os
   gatilhos de revogação de acesso da Fase 3), `dp_folga_admin_criar`
   (complementa cancelar/remarcar já existentes), disciplinar registrar/
   corrigir/excluir (exclusão lógica).
3. **Fechar gravação direta** — `*_admin_write` → `*_admin_read` (SELECT) em
   `dp_colaboradores`, `dp_colaborador_config_trabalho`, `dp_colaborador_config_dias`,
   `dp_colaborador_historico_condicoes`, `dp_folgas` (preservando a autoinserção
   do colaborador) e `dp_registros_disciplinares`; remover o INSERT direto de
   `dp_documento_aceites`. REVOKE INSERT/UPDATE/DELETE de `authenticated`,
   REVOKE ALL de `anon`, GRANT ALL de `service_role`.
4. **Frontend** — cadastro/edição do colaborador, condições de trabalho,
   desligamento, recontratação (com aviso do que será fechado e do que começa),
   linha do tempo de vínculos na ficha, calendário de folgas do gestor e
   disciplinares chamam as rotinas; erros traduzidos em `src/lib/dp/`. Sem
   mudança de layout.
5. **Migration** com rollback descrito; nenhum dado existente perdido.
6. **Testes** — em `src/test/rls/` e provas em transação desfeita: recontratação
   preservando o período anterior, duplo clique, admissão anterior ao
   desligamento recusada, configuração de trabalho antiga encerrada, salvar ficha,
   empresa alheia, Pix inválido, titular de terceiro, gravação direta recusada,
   folga em data bloqueada, limite do dia, folga repetida. `bunx tsgo` e
   `bunx vitest run`.

## Fora do escopo

Módulo financeiro, publicação do site (fases 1 a 5 seguem aguardando sua
decisão) e os cadastros auxiliares (cargos, turnos, sindicatos, benefícios), que
entram na fase seguinte.

Ao final: relatório obrigatório da fase e parada para sua conferência.
