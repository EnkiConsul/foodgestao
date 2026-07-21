## Problema real no 360°FOOD

O colaborador **não insere direto em `dp_folgas`** — ele cria uma linha em `dp_solicitacoes` (tipo `folga`), que o admin aprova depois. Só a aprovação gera `dp_folgas`.

- `dp_folgas` **já tem** trigger `dp_validar_folga_insert` que valida limite diário, datas bloqueadas coletivas e bloqueios individuais.
- `dp_solicitacoes` **não valida nada** — por isso o colaborador consegue pedir folga em data lotada. O erro só apareceria na hora de o admin aprovar (ou pior, passa despercebido).
- No frontend, `src/pages/dp/portal/DpMeuSolicitacoes.tsx` também não checa capacidade antes do insert.
- O calendário `DpMeuCalendario` já usa `calculateDateStatus` (que retorna `taken`/`blocked`), mas ao clicar em um dia lotado ele mesmo assim abre o formulário de solicitação com a data preenchida.

Nota: os arquivos citados na mensagem (`src/lib/folga-rules.ts`, `src/pages/Calendario.tsx`, `src/lib/admin-api.ts`, `supabase/functions/sorteio-folgas/index.ts`) são do projeto legado Pakere. No 360°FOOD os equivalentes são `src/lib/dp/folga-rules.ts`, `src/pages/dp/portal/DpMeuCalendario.tsx` + `DpMeuSolicitacoes.tsx`, e a Edge Function `dp-sorteio-folgas` (que já valida bloqueios/limites). Vou aplicar a correção nesses.

## Correção

### 1. Frontend — `src/pages/dp/portal/DpMeuSolicitacoes.tsx`

Quando `tipo = folga` e há `data_alvo` selecionada:

- Buscar em paralelo (react-query): folgas existentes no dia, `dp_dia_config` (limite), `dp_datas_bloqueadas`, solicitações pendentes do dia, e o próprio perfil (`folga_fixa_semana`, `unidade_id`).
- Rodar `calculateDateStatus` de `src/lib/dp/folga-rules.ts` sobre a data escolhida.
- Se retornar `taken` → bloquear com aviso: **"Data indisponível. Limite de folgas atingido (X/Y)."**
- Se retornar `blocked` → **"Esta data está bloqueada pelo DP."** (hoje só há aviso amarelo permitindo enviar; passa a impedir para `tipo=folga`).
- Botão **Enviar** fica desabilitado nesses casos; adicionar a mensagem no bloco de `validation`.
- Para outros tipos (`atestado`, `ferias`, `adiantamento`, `outro`) mantém o comportamento atual (não valida capacidade).

### 2. Frontend — `src/pages/dp/portal/DpMeuCalendario.tsx`

- No `onSelectDay`, antes de navegar, checar o `DateStatus` do dia via `calculateDateStatus` (dados já carregados na página). Se `taken`/`blocked`/`past` → `toast.error` com o motivo e **não** navegar para a nova solicitação. Se `available`/`fixed`/`mine` → comportamento atual.
- A ocupação já aparece via `FolgaCalendarShared` (badge X/Y). Sem mudança visual necessária.

### 3. Backend — nova migração

Criar trigger `BEFORE INSERT ON dp_solicitacoes` (`dp_validar_solicitacao_folga`) que, quando `tipo = 'folga'` e `status = 'pendente'`:

- Verifica `dp_datas_bloqueadas` (empresa/unidade, respeitando `liberada_por_solicitacao`).
- Verifica `dp_bloqueios` individuais do colaborador.
- Calcula ocupação = folgas confirmadas (não canceladas, não extra, tipos elegíveis) + solicitações **pendentes** do mesmo dia/unidade, e compara com `dp_dia_config.limite_folgas` (unidade específica tem prioridade sobre nulo).
- Se estourar → `RAISE EXCEPTION` com mensagem `"Data % indisponível. Limite de folgas atingido"`.
- Solicitações com `tipo != 'folga'` ou `status = 'cancelada'` passam livres.

Assim a validação é servidor-primeiro e nunca fica dessincronizada com o RLS.

### 4. Sem alteração

- `dp_folgas` já tem sua trigger própria — nada a mudar lá.
- `dp-sorteio-folgas` (Edge Function) já respeita o mesmo limite.

## Verificação

1. Como colaborador, tentar solicitar folga em dia lotado → toast "Data indisponível…" e insert bloqueado (tanto no botão quanto no banco caso alguém burle o front).
2. No calendário do colaborador, clicar em dia lotado → toast, sem abrir formulário.
3. Como admin, `dp_dia_config` continua refletindo ocupação correta (X/Y) — não há mudança na leitura.
4. Solicitações de `atestado`/`ferias` continuam sendo criadas normalmente em qualquer data.