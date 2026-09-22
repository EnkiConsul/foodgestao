# Correções Pessoas 360° — Fase 4: Concorrência de Férias

Objetivo: garantir que dois pedidos ou duas aprovações ao mesmo tempo nunca gerem férias sobrepostas, saldo estourado ou mais gente de folga do que a regra da empresa permite. Nada muda na aparência das telas de férias; muda o que o sistema aceita gravar.

## O que está frágil hoje (verificado no banco)

1. **Limite de pessoas em férias ao mesmo tempo não resiste a aprovações simultâneas.** A conferência do limite (regra por unidade/cargo/turno) apenas conta quem já está de férias no período. Duas aprovações de colaboradores diferentes, feitas no mesmo instante, não veem uma à outra e as duas passam — o limite é estourado.
2. **Mesmo colaborador pode acabar com dois períodos de férias sobrepostos.** A travessa hoje é feita no período aquisitivo. Se as duas férias saírem de períodos aquisitivos diferentes (por exemplo 2024/2025 e 2025/2026), as datas podem se sobrepor sem o sistema perceber.
3. **Cobertura mínima do turno é só sugestão.** A tela indica o descoberto, mas a aprovação não impede deixar o turno abaixo do mínimo, nem avalia isso em concorrência.
4. **Administrador pode gravar férias e saldo direto, sem passar pelas regras.** A permissão atual permite inserir, alterar e apagar registros de férias e de períodos aquisitivos diretamente, fora das funções de servidor. O sistema hoje só usa as funções — a permissão ampla é risco sem uso.
5. **O pedido do colaborador confere menos regras do que a aprovação.** Ele consegue enviar um pedido que o gestor não vai conseguir aprovar (fracionamento, véspera de feriado/descanso, período bloqueado), e só descobre depois.

## O que será feito

### Bloqueio de disputa no servidor
- Toda gravação de férias (programar, aprovar, editar, cancelar) passa a tomar uma trava por colaborador e uma trava por empresa/unidade antes de conferir as regras, e libera no fim da transação. Duas operações concorrentes viram fila: a segunda enxerga a primeira e é recusada com a mensagem certa.
- A conferência de sobreposição passa a ser por colaborador (todas as férias dele, de qualquer período aquisitivo), não por período.
- Reforço no banco: regra de exclusão que impede fisicamente duas férias ativas do mesmo colaborador com datas que se cruzam, para que nem uma gravação direta consiga criar a sobreposição.

### Limite de pessoas e cobertura mínima
- O limite de simultâneos passa a ser conferido depois da trava, contando também o que acabou de ser gravado na transação em andamento.
- Cobertura mínima do turno passa a ser avaliada na aprovação: se as férias deixarem algum dia abaixo do mínimo, a operação é recusada e o gestor recebe os dias e o turno em falta. Com justificativa registrada, a aprovação segue (mesmo padrão já usado em aviso fora do prazo).

### Fechar gravação direta
- Administradores deixam de inserir, alterar e apagar registros de férias e de períodos aquisitivos direto; leitura continua igual. Todas as ações do produto passam pelas funções de servidor, que é o que as telas já fazem hoje.

### Pedido do colaborador com a mesma régua
- O pedido no portal passa a conferir as mesmas regras da aprovação (bloqueios, fracionamento, véspera, sobreposição, limite de simultâneos), então o colaborador recebe o motivo na hora em vez de o gestor travar depois.
- Mensagens de recusa em linguagem de negócio, sem código técnico.

## Testes
- Duas aprovações simultâneas com limite de 1 pessoa: uma passa, a outra é recusada.
- Duas férias sobrepostas do mesmo colaborador em períodos aquisitivos diferentes: recusado.
- Saldo: dois pedidos concorrentes que somados passam do direito — só um entra.
- Cobertura mínima: recusa sem justificativa, aprovação com justificativa registrada.
- Duplo clique em aprovar: uma única programação, sem duplicidade.
- Gravação direta na tabela de férias e de períodos: negada.
- Outra empresa: negado em todos os caminhos.
- Suíte completa, tipos e verificação das funções de servidor.

## Detalhes técnicos
- Migration isolada e reversível: `pg_advisory_xact_lock` por `colaborador_id` e por `company_id|unidade_id` em `dp_ferias_programar`, `dp_ferias_aprovar`, `dp_ferias_gozo_editar`, `dp_ferias_cancelar` e `dp_ferias_solicitar`; validação de sobreposição em `dp_ferias_validar_programacao` passa a filtrar por `colaborador_id` (já é o caso) sem depender do `FOR UPDATE` do período; `CREATE EXTENSION btree_gist` (schema `extensions`) + `EXCLUDE USING gist (colaborador_id WITH =, daterange(data_inicio, data_fim, '[]') WITH &&) WHERE (status <> 'cancelado')` em `dp_ferias_gozos`.
- Cobertura mínima reaproveita a lógica de `dp_ferias_cobertura_sugestao` numa função `private.dp_ferias_cobertura_descoberta(...)` chamada por `dp_ferias_validar_programacao`, com bypass por `_justificativa`.
- `REVOKE INSERT, UPDATE, DELETE` de `authenticated` em `dp_ferias_gozos` e `dp_ferias_periodos`; políticas `*_admin_write` reduzidas a SELECT; `GRANT ALL` mantido para `service_role`.
- `dp_ferias_solicitar` passa a chamar `dp_ferias_validar_programacao` em modo pedido (sem exigir permissão de gestor), com tratamento de erro traduzido em `src/lib/dp/ferias-direito.ts` (`textoErroFerias`).
- Antes de aplicar: conferir que as férias já existentes não violam a nova regra de exclusão; se houver sobreposição histórica, ela é listada e tratada com você antes da migration — nenhum dado é apagado.
- Verificação final: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run` e testes em transação desfeita no banco.
- Ao final da fase: parada com relatório e sem publicar o site.
