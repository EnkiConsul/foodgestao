# Risco de perder o prêmio de assiduidade

Quando o colaborador tem prêmio de assiduidade cadastrado, a ocorrência que pode custar esse prêmio passa a ser sinalizada na hora e vira uma pendência de decisão do gestor — e o colaborador acompanha o resultado.

## Como vai funcionar

1. **Sinalização na hora do registro**
   - Ao registrar atraso, falta, saída antecipada ou atestado, o sistema confere a regra do próprio colaborador: tolerância de atraso em minutos, quantidade de atrasos tolerados, se atestado conta e quantos atestados são tolerados.
   - Quando a ocorrência pode custar o prêmio, aparece o aviso em linguagem simples, tanto para o gestor quanto para o colaborador no portal, antes de enviar: por exemplo "Atraso de 25 minutos acima da tolerância de 10 minutos — pode custar o prêmio de assiduidade".
   - Atraso dentro da tolerância, ou colaborador sem prêmio cadastrado, não gera aviso nem pendência.

2. **Pendência para o gestor decidir**
   - A ocorrência fica como "Assiduidade aguardando decisão" e entra na lista de pendências do Início, junto das demais.
   - No card da ocorrência o gestor decide entre **Perde o prêmio** e **Mantém o prêmio**. Manter exige justificativa escrita (abono é liberalidade e precisa ficar registrado); perder aceita observação opcional.
   - A decisão fica gravada com quem decidiu, quando e o motivo, e some da lista de pendências.

3. **O colaborador fica sabendo**
   - Na lista de ocorrências dele, cada registro mostra o estado: "Em análise pelo gestor", "Não afeta o prêmio" ou "Perdeu o prêmio deste mês", com o motivo quando houver.
   - Quando a decisão for perder o prêmio, ele recebe notificação no portal. Quando mantiver, apenas a lista é atualizada.

4. **Cálculo do prêmio**
   - O cálculo do prêmio no mês passa a considerar somente as ocorrências decididas como "perde"; as que estão aguardando decisão aparecem como aviso de valor ainda em aberto, sem cortar o prêmio por conta própria.

## Detalhes técnicos

- **Banco (migration reversível)**
  - `dp_ocorrencias`: novas colunas `assiduidade_risco boolean NOT NULL DEFAULT false`, `assiduidade_risco_motivo text`, `assiduidade_decidido_por uuid`, `assiduidade_decidido_em timestamptz`, `assiduidade_observacao text`. Índice parcial para as que estão aguardando decisão.
  - `private.dp_assiduidade_risco(_colaborador_id, _tipo, _minutos)`: avalia a regra vigente do colaborador (`premio_assiduidade`, `assiduidade_criterio`, `assiduidade_tolerancia_min`, `assiduidade_max_atrasos`, `assiduidade_considera_atestado`, `assiduidade_max_atestados`) e devolve risco + motivo em texto de negócio.
  - `dp_ocorrencia_registrar` e `dp_ocorrencia_confirmar` recalculam o risco no servidor e, havendo risco, gravam `impacta_assiduidade = 'aguardando'` com o motivo, mais evento em `dp_ocorrencia_eventos`. Idempotente: reexecutar não duplica evento nem sobrescreve decisão já tomada.
  - Nova RPC oficial `public.dp_ocorrencia_assiduidade_decidir(p_ocorrencia_id, p_perde boolean, p_observacao text)`: SECURITY DEFINER, valida empresa por `private.dp_regras_admin`, exige observação quando `p_perde = false` (`ASSIDUIDADE_MOTIVO_OBRIGATORIO`), grava decisão + evento + auditoria e, quando perde, insere `dp_notificacoes` para o colaborador. Erros: `OCORRENCIA_NAO_ENCONTRADA`, `ASSIDUIDADE_SEM_RISCO`, `ASSIDUIDADE_JA_DECIDIDA`. `EXECUTE` só para `authenticated` e `service_role`.
  - Nenhuma gravação direta liberada: o frontend só chama a RPC.

- **Frontend**
  - `src/lib/dp/assiduidade-risco.ts`: espelho puro da avaliação de risco (mesma regra, para prévia na tela) e tradutor das mensagens de erro.
  - `src/hooks/useDpOcorrencias.tsx` e `src/hooks/useMinhasOcorrencias.tsx`: novos campos na consulta e mutação `decidirAssiduidade`.
  - `OcorrenciaCard.tsx`: selo "Pode custar o prêmio" com o motivo e os botões de decisão (diálogo com justificativa obrigatória ao manter).
  - `DpOcorrencias.tsx`: filtro por "Assiduidade aguardando decisão"; diálogo de nova ocorrência mostra o aviso de risco calculado.
  - `MinhaJornadaAcoesCard.tsx` / portal: aviso de risco antes de enviar e estado da decisão na lista do colaborador.
  - `useDpPendencias.tsx`: nova pendência "Assiduidade aguardando decisão" apontando para `/dp/ocorrencias`.
  - `remuneracao.ts`: contagem de atrasos/faltas/atestados do prêmio passa a usar as ocorrências decididas como "perde".

- **Provas e testes**
  - Testes unitários da avaliação de risco (dentro/fora da tolerância, limite de atrasos, atestado considerado ou não, colaborador sem prêmio).
  - Provas no banco em transação desfeita: risco gravado no registro, decisão exigindo motivo ao manter, segunda decisão recusada, empresa alheia recusada, gravação direta recusada e leitura preservada.
  - `bunx vitest run`, `bunx tsgo` e ESLint. Nada publicado sem pedido.
