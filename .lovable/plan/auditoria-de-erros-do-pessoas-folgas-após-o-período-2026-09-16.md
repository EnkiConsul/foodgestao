# Auditoria de erros do Pessoas + folgas após o período

## 1. Avaliação dos erros abertos

Verifiquei os 17 registros abertos (7 problemas distintos) no banco e no código.

**Já resolvidos — nenhuma correção necessária:**

| Erro | Verificação |
| --- | --- |
| `relation "public.dp_pontos" does not exist` (atualizar pendências, 15/09) | Nenhuma rotina, visão ou gatilho cita mais essa tabela. |
| `PortalSomenteDocumentos is not defined` (/hub, 14/09) | Existe e está em uso nas rotas do portal. |
| `containerRef is not defined` (/dp, 12/09) | Não existe mais em tela alguma. |
| `useRef is not defined` (/dp, 12/09) | Idem. |
| `ModuleSwitcherChip is not defined` (/dp/cadastros, 12/09) | Existe e está em uso no cabeçalho. |
| `Should have a queue... bug in React` (/hub, 14/09) | Efeito do recarregamento em desenvolvimento, junto do erro acima. |

Os cinco "X is not defined" vieram do endereço de desenvolvimento, durante edição de
tela — não ocorrem no app publicado. Serão fechados na Auditoria com nota do motivo.

**Problema real:** o aviso "A escolha das folgas foi encerrada. Use Solicitar exceção"
é gravado como falha do sistema e, pior, o colaborador vê um texto genérico ("Erro ao
marcar folga") em vez da explicação. Vale para todas as barreiras de regra do calendário.

## 2. Folgas depois do período de escolha

Confirmado no código e nas rotinas: exceção e troca já funcionam com o período
encerrado. O que falta é a marcação direta — hoje ela é recusada. Conforme sua decisão,
com o período **encerrado** o colaborador passa a poder remover a folga e escolher outra
data futura por conta própria; antes da abertura continua só exceção. As trocas seguem
respeitando a configuração da unidade (se a unidade proíbe trocar a dominical, continua
proibido).

## 3. O que será feito

1. **Marcação direta liberada após o encerramento** — o bloqueio passa a valer apenas
   antes da abertura do período; com o período encerrado, qualquer data futura de fim de
   semana pode ser marcada, continuando sujeita a limite de pessoas por dia,
   incompatibilidade entre colegas, folga fixa e folga dominical obrigatória.
2. **Avisos claros** — o cartão do topo e as mensagens passam a dizer o que vale em cada
   momento: antes da abertura, só exceção; período aberto, escolha livre do mês seguinte;
   encerrado, escolha de datas futuras, troca e exceção liberadas.
3. **Fim do ruído na Auditoria** — avisos de regra deixam de ser registrados como erro e
   mostram ao colaborador a frase exata da regra.
4. **Encerrar os seis erros já resolvidos** na Auditoria, com nota.

## Detalhes técnicos

- Migração nova em `dp_folga_marcar`: recusar apenas quando o estado da janela é
  `antes` (ou data fora do escopo permitido nesse estado); com `encerrada`, seguir para
  as demais validações (limite, incompatibilidade, folga obrigatória, data passada).
  Mantém SECURITY INVOKER/RLS, sem alterar dados existentes.
- `src/lib/dp/folga-janela.ts`: `podeMarcarNormal` libera `encerrada` para datas futuras;
  `mensagemJanela` com os três textos. Testes unitários dos três estados.
- Novo `src/lib/dp/regraAviso.ts` (`RegraNegada` + `negarRegra`); `src/lib/notifyError.ts`
  usa `error.message` e silencia o registro quando o erro é de regra.
- `src/pages/dp/portal/DpMeuCalendario.tsx`: validações locais e traduções de
  `FOLGA_FORA_DA_JANELA`/`FOLGA_LIMITE_DIA`/`FOLGA_INCOMPATIBILIDADE` passam a usar
  `negarRegra`; nenhuma mudança de layout.
- Atualização de status dos seis registros resolvidos em `app_error_logs` (status e nota
  apenas). Testes: `bunx tsgo -p tsconfig.app.json --noEmit` e `bunx vitest run`.
