# Pessoas 360° — Fase 1: Correções Críticas da Rotina e da Jornada

Somente a Fase 1. Paro ao final e aguardo aprovação para a Fase 2.

## Diagnóstico (verificado agora)

**1. Erro ao marcar "Dia OK"** — confirmado. A tabela `dp_operacao_alertas_dispensas` tem índice único por *expressão*: `(company_id, COALESCE(unidade_id, '000...0'), data)`. O aplicativo pede conflito por `company_id,unidade_id,data`, que não corresponde a nenhuma restrição — daí a mensagem técnica. Não existe restrição simples e criar uma não resolveria, porque `unidade_id` pode ser vazio (visão "todas as unidades").

**2. Erro ao alterar o Setor de Folguista** — confirmado. Na Rotina, pessoas avulsas recebem um identificador de tela `avulso:<uuid>` (`src/lib/dp/operacao-panorama.ts`), e a janela de setor envia esse texto para a rotina de banco que espera um identificador de colaborador. Além disso, nem `dp_pessoas_avulsas` nem `dp_pessoas_apoio` têm campo de setor hoje — não há onde guardar.

**3. Troca do dia de folga trazendo o horário errado** — o painel de Jornada recalcula um "horário predominante da semana" e preenche o dia reativado com ele, sem olhar o horário do dia que virou folga nem o grupo de dias equivalente. É a causa provável do caso da terça-feira; confirmo no código antes de alterar.

**4. Pessoa aparecendo como "Fora do Horário de Funcionamento"** — a classificação está em `src/lib/dp/operacao-panorama.ts` e depende de sobreposição entre a jornada do dia e o funcionamento da unidade. A causa exata ainda **não** está confirmada; primeiro passo da execução é reproduzir com o caso real e só então corrigir a regra geral.

**5. "Folguista (cobrindo alguém)"** — confirmado: o texto é fixo em `DpPessoaAvulsaDialog.tsx` e a Rotina só troca quando há alguém vinculado.

## O que a Fase 1 entrega

### Marcar "Dia OK" sem erro
Passa a existir uma rotina de banco transacional que grava a resolução do dia de forma idempotente, respeitando o caso "sem unidade", com travamento contra duas marcações simultâneas e escopo da empresa validado no servidor. Marcar duas vezes não duplica nem falha.

### Setor do Dia do Folguista e da Pessoa em Teste
- Passa a existir campo de setor em `dp_pessoas_avulsas` (por dia) e a janela de setor envia o tipo de pessoa (colaborador ou pessoa avulsa) com o identificador real, nunca o texto de tela.
- O servidor valida que o setor é da mesma empresa e da mesma unidade e está ativo.
- Resultado: o gestor consegue salvar o setor do folguista no dia.

### Troca do dia de folga preservando o horário
Ao trocar a folga de um dia para outro na mesma edição, o horário do dia que virou folga é reaproveitado no novo dia trabalhado. Sem troca direta, a ordem é: horário já configurado para aquele dia da semana → padrão do grupo de dias equivalente → por último, o horário predominante. O horário aplicado sempre aparece na tela antes de salvar.
Teste de regressão do caso relatado (segunda/quarta/quinta = horário A; sexta/sábado/domingo = horário B; folga da terça movida para segunda → terça fica com horário A).

### "Fora do Horário de Funcionamento" correto
Reprodução do caso real, correção da regra geral (vigência da jornada, ajustes por dia, turno noturno, virada de meia-noite, unidade fechada) e testes cobrindo: turno diurno dentro do funcionamento, turno noturno, turno cruzando a meia-noite, unidade fechada e jornada parcialmente fora.

### Texto do Folguista
Sem cobertura: **Folguista**. Com cobertura: **Folguista · Cobrindo Maria**. Vale na Rotina e no cadastro da pessoa do dia.

### Mensagens de erro da Rotina
Erros deixam de empilhar no topo da tela: passam a ser aviso temporário, com fechar, um por ação (o novo substitui o anterior da mesma operação). Nada de texto técnico de banco, rastreamento de erro ou identificador interno na tela — o detalhe fica só no registro técnico. Exemplos: "Não foi possível alterar o setor. Tente novamente." e "O setor selecionado não pertence a esta unidade."

### Títulos
Nas telas tocadas nesta fase, títulos, cabeçalhos de cartões, de janelas e de tabelas passam a Iniciais Maiúsculas (preposições em minúsculas). Nenhuma menção a 360°FOOD nas telas alteradas.

## Critérios de aceite
- Marcar o dia como OK funciona, inclusive na visão sem unidade, e duas ações simultâneas não duplicam.
- Alterar o setor do folguista salva; nenhum identificador de tela chega ao banco.
- Trocar o dia da folga mantém o horário correto e visível antes de salvar.
- Jornada diurna válida não aparece mais como fora do funcionamento.
- Folguista sem cobertura não diz "cobrindo alguém".
- Nenhuma mensagem técnica chega ao usuário; erros não acumulam.
- Empresa A não altera dados da empresa B (verificado no servidor).

## Detalhes técnicos
- Migração: rotina `dp_operacao_alerta_dispensar`/`reverter` com `SECURITY DEFINER`, `pg_advisory_xact_lock`, gravação alinhada ao índice de expressão existente, `REVOKE EXECUTE ... FROM anon, PUBLIC` + `GRANT EXECUTE ... TO authenticated, service_role`, autorização por `private.is_company_admin_or_owner`.
- Migração: `dp_pessoas_avulsas.setor_id uuid NULL REFERENCES dp_setores(id)`, validação de empresa/unidade por gatilho; `dp_escala_definir_setor_dia` ganha parâmetro de tipo de alvo (`colaborador` | `pessoa_avulsa`) mantendo a assinatura atual funcionando.
- Frontend: `useDpOperacaoPanorama.tsx` (dispensa e setor do dia), `AlterarSetorDiaDialog.tsx`, `operacao-panorama.ts` (rótulo do folguista e regra de funcionamento), `DpOperacaoPanorama.tsx` (avisos de erro), `ColaboradorJornadaPanel.tsx` (troca de folga), `DpPessoaAvulsaDialog.tsx` (texto).
- Camada de mensagens: tradutor único de erro do banco para texto do usuário nas ações da Rotina.
- Nenhum dado apagado. Validação com `npx vite build`, `npm run lint`, `npm run typecheck:strict` e os testes unitários já existentes de `operacao-panorama` e jornada (sem suítes pesadas).

## Fora de escopo nesta fase
Fases 2 a 6 do plano mestre, Convocações, Folha de Pagamento, Portais e responsividade geral.
