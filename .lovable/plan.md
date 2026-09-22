# Pessoas 360° — Fase 6: Ficha do colaborador e folgas por rotina oficial

Escolhi o bloco de maior exposição: hoje o aplicativo ainda consegue gravar
direto na ficha do colaborador (129 campos, incluindo salário, dados de
pagamento, vínculo de acesso e desligamento), nas folgas, nos registros
disciplinares e no aceite de documento. Nas fases 1 a 5 esse caminho foi fechado
para documentos, solicitações, férias e escala; a ficha e as folgas são o que
sobrou aberto.

## O que muda para quem usa

- Admitir, alterar e desligar colaborador passa a ser uma operação única no
  servidor: ou grava tudo (ficha, condições de trabalho, histórico), ou nada.
- Clique repetido em Salvar não cria duplicidade nem histórico duplicado.
- Campos sensíveis (salário, dados de pagamento, vínculo do acesso, situação e
  desligamento) só mudam pela rotina oficial, sempre com registro de quem mudou.
- Folga criada, cancelada ou remarcada pelo gestor sempre passa pelas conferências
  (data passada, bloqueios, limite por dia, folga repetida) — nada entra por fora.
- Registro disciplinar e aceite de documento também deixam de aceitar gravação
  direta: valem as rotinas já criadas na Fase 1.
- Mensagens de recusa em linguagem de negócio, sem código interno.

## Escopo técnico

Verificado no banco antes do plano: `dp_colaboradores` tem política `ALL`
(`dp_colab_admin_write`) e `authenticated` com INSERT/UPDATE/DELETE;
`dp_folgas` tem `dp_folgas_admin_write` (ALL) mais autoinserção do colaborador;
`dp_registros_disciplinares` tem `dp_disc_write` (ALL); `dp_documento_aceites`
ainda aceita INSERT direto do administrador. `dp_portal_access_tokens` já está
fechado (política `false`) — nada a fazer nele.

1. **Rotinas oficiais (SECURITY DEFINER, `public`, EXECUTE só para
   `authenticated`/`service_role`)**
   - `dp_colaborador_salvar(p_id, p_dados jsonb, p_config jsonb, p_versao)` —
     fila por colaborador (advisory lock), conferência de empresa/unidade/cargo/
     setor/turno, regras de pagamento (Pix CPF ou celular, titular próprio),
     sócio, menores, CPF duplicado; grava ficha + condições de trabalho +
     histórico numa transação; idempotente por versão.
   - `dp_colaborador_desligar(p_id, p_data, p_motivo, ...)` / reativar —
     mantém os gatilhos de revogação de acesso da Fase 3.
   - `dp_folga_admin_criar(...)` complementando `dp_folga_admin_cancelar` e
     `dp_folga_admin_remarcar` já existentes; fila por colaborador/data.
   - `dp_registro_disciplinar_registrar` / `_corrigir` / `_excluir` (exclusão
     lógica, sem apagar histórico).
   - Conferências reaproveitadas em `private`: `dp_colaborador_conferir`,
     `dp_folga_conferir` (sem duplicar regra existente nos gatilhos).
2. **Fechar gravação direta** — `*_admin_write` → `*_admin_read` (SELECT) em
   `dp_colaboradores`, `dp_colaborador_config_trabalho`, `dp_colaborador_config_dias`,
   `dp_colaborador_historico_condicoes`, `dp_folgas` (preservando a autoinserção
   do colaborador, que já é restrita), `dp_registros_disciplinares`; remover o
   INSERT direto de `dp_documento_aceites`. REVOKE INSERT/UPDATE/DELETE de
   `authenticated`, REVOKE ALL de `anon`, GRANT ALL de `service_role`.
3. **Frontend** — telas de cadastro/edição do colaborador, condições de trabalho,
   desligamento, calendário de folgas do gestor e registros disciplinares passam
   a chamar as rotinas; tradução de erros em `src/lib/dp/` no padrão das fases
   anteriores. Sem mudança de layout.
4. **Migration** com rollback descrito; nenhum dado existente alterado.
5. **Testes** — `src/test/rls/` com visitante negado nas tabelas e rotinas;
   provas em transação desfeita: salvar ficha, duplo clique, empresa alheia,
   Pix inválido, titular de terceiro, gravação direta recusada, folga em data
   bloqueada, limite do dia, folga repetida, disciplinar de outra empresa.
   `bunx tsgo` e `bunx vitest run`.

## Fora do escopo

Módulo financeiro, publicação do site (fases 1 a 5 seguem aguardando sua
decisão) e o restante das tabelas de cadastro auxiliar (cargos, turnos,
sindicatos, benefícios), que entram numa fase seguinte.

Ao final: relatório obrigatório da fase e parada para sua conferência.
