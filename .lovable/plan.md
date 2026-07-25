# Plano final — Revisão do Quadro de Pendências

Escopo: corrigir a inconsistência global (cache) + as 4 inconsistências específicas + decisões de produto.

## 1. Invalidação do cache de pendências (causa raiz do sintoma "troca aprovada não some")

Adicionar `queryClient.invalidateQueries({ queryKey: ["dp_pendencias"] })` no `onSuccess` de cada mutação que resolve uma pendência:

- `src/pages/dp/DpTrocas.tsx` — aprovação/recusa de gestor e colega
- `src/pages/dp/DpMeuTrocas.tsx` — aprovação/recusa de colega
- `src/pages/dp/DpSolicitacoes.tsx` — `respond`
- `src/pages/dp/DpAtestados.tsx` — aprovar/recusar atestado
- `src/pages/dp/DpDocumentosPorTipo.tsx` — importação e aprovação bulk
- `src/pages/dp/DpSindicatoNegociacoes.tsx` — insert/update de negociação

E robustecer o hook:
- `src/hooks/useDpPendencias.tsx` — `staleTime: 30_000`, `refetchOnWindowFocus: true`.

## 2. Contracheque/Adiantamento — remover código morto (decisão: b)

Em `src/hooks/useDpPendencias.tsx` blocos 3 e 4:
- Remover a checagem em `dp_folha_periodos.status = 'fechado'`.
- Manter apenas a checagem por `dp_documentos` importados por unidade (comportamento efetivo hoje).

## 3. Negociação ACT/CCT — sem UI extra (decisão: a)

Resolução continua sendo "cadastrar nova negociação com ano/mês mais recente". Ajuste mínimo:
- No card do bloco 6, incluir no `subtitulo` a instrução `"Cadastre nova negociação para renovar"` para o usuário entender que editar a última não resolve.

## 4. Janela de alerta configurável por empresa

### 4.1. Migration
Criar tabela `dp_pendencias_config` com campos por empresa:

| coluna | tipo | default |
|---|---|---|
| `company_id` | uuid (PK) | — |
| `alerta_solicitacao_dias` | int | 3 |
| `alerta_troca_dias` | int | 3 |
| `alerta_contracheque_dia_mes` | int | 10 |
| `alerta_adiantamento_offset` | int | 5 |
| `alerta_folha_ponto_dia_mes` | int | 10 |
| `alerta_negociacao_dias` | int | 30 |

Grants padrão para `authenticated`+`service_role`, RLS: ler/escrever apenas membros da empresa (via `has_role`/associação em `company_members`).

### 4.2. Hook novo `useDpPendenciasConfig`
Lê a configuração da empresa (com defaults) e retorna os valores acima.

### 4.3. Consumir no `useDpPendencias.tsx`
Substituir todos os literais (`3`, `10`, `5`, `30`) pelos valores do hook.

### 4.4. UI em `/dp/configuracoes`
Novo card "Prazos de lembrete das pendências" com um input numérico por tipo de atividade e botão "Salvar". Layout consistente com os cards já existentes de `DpConfiguracoes.tsx`.

## 5. Botão "Adiar" unificado

Trocar os dois botões "Adiar 1d" / "Adiar 7d" em `src/components/dp/home/PendenciasCard.tsx` por um único botão "Adiar" que abre um `Popover` com opções rápidas + campo de dias customizado:

- Opções rápidas: `1 dia`, `3 dias`, `7 dias`, `15 dias`, `30 dias`
- Campo "Personalizado (dias)" com input numérico + botão "Aplicar"

O comportamento persistente continua o mesmo (grava em `dp_user_prefs.pendencias_adiadas`). Também aplicar a mesma unificação no `Dialog` de detalhes (`DialogFooter`).

## 6. Correção de shift UTC nas datas (baixo custo)

Trocar `ymd()` em `useDpPendencias.tsx` por `format(d, "yyyy-MM-dd")` do `date-fns` — evita off-by-one em bordas de mês no fuso do Brasil.

## Fora de escopo

- Não vou criar botão "Fechar folha" nem tocar em `/dp/folha` (decidido: b).
- Não vou criar coluna `renovada_em` em negociações (decidido: a).
- Não vou mexer nos textos/enum de `dp_folha_periodos.status`.

## Arquivos afetados

- Migration nova: `dp_pendencias_config`.
- `src/hooks/useDpPendencias.tsx` — remove branch morto, consome config, `staleTime`/`refetchOnWindowFocus`, corrige `ymd`.
- `src/hooks/useDpPendenciasConfig.tsx` (novo).
- `src/pages/dp/DpConfiguracoes.tsx` — novo card de prazos.
- `src/components/dp/home/PendenciasCard.tsx` — botão "Adiar" unificado com popover.
- `src/pages/dp/DpTrocas.tsx`, `DpMeuTrocas.tsx`, `DpSolicitacoes.tsx`, `DpAtestados.tsx`, `DpDocumentosPorTipo.tsx`, `DpSindicatoNegociacoes.tsx` — invalidação de `["dp_pendencias"]`.
