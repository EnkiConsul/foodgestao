# Auditoria de erros do Pessoas — avaliação e plano

Verifiquei os **17 registros abertos** (7 problemas distintos) diretamente no banco e no código.

## Já resolvidos — nenhuma correção necessária

| Erro | Verificação |
| --- | --- |
| `relation "public.dp_pontos" does not exist` (atualizar pendências, 15/09) | Nenhuma rotina, visão ou gatilho do banco cita mais essa tabela. |
| `PortalSomenteDocumentos is not defined` (/hub, 14/09) | O componente existe e está importado nas rotas do portal. |
| `containerRef is not defined` (/dp, 12/09) | Identificador não existe mais em nenhuma tela. |
| `useRef is not defined` (/dp, 12/09) | Idem. |
| `ModuleSwitcherChip is not defined` (/dp/cadastros, 12/09) | O componente existe e está importado no cabeçalho. |
| `Should have a queue... bug in React` (/hub, 14/09) | Efeito colateral do recarregamento em desenvolvimento, junto do erro acima. |

Os cinco "X is not defined" vieram todos do endereço de desenvolvimento, durante recarregamento de tela em edição — não acontecem no app publicado.

## Problema real a resolver

**Aviso de regra registrado como falha do sistema** — em "Meu calendário", quando o
colaborador tenta marcar folga fora do período de escolha, em dia de semana, em folga
fixa ou no domingo do padrão CLT, o app:

- mostra um texto genérico ("Erro ao marcar folga") e **esconde a explicação real**
  que o próprio código escreveu ("A escolha das folgas de setembro foi encerrada em
  ... Use Solicitar exceção");
- registra o aviso na Auditoria de erros como se fosse defeito, poluindo a lista.

## O que será feito

1. Criar um tipo de aviso de regra para o Pessoas: quando a ação é barrada por regra
   (e não por falha), o app mostra **a frase exata da regra** ao colaborador e não
   registra nada na Auditoria de erros.
2. Aplicar nas barreiras de "Meu calendário": marcar folga, remover folga, solicitar
   exceção e pedir troca — as validações passam a usar esse aviso; falhas de verdade
   (rede, banco) continuam registradas como hoje.
3. Fechar na Auditoria os seis erros já resolvidos, com nota do motivo, para a lista
   refletir só o que existe.

## Detalhes técnicos

- Novo `src/lib/dp/regraAviso.ts`: `class RegraNegada extends Error` + `negarRegra(msg)`.
- `src/lib/notifyError.ts`: quando o erro é `RegraNegada`, usar `error.message` como
  texto do aviso (`toast.warning`) e silenciar `reportError`; demais casos inalterados.
- `src/pages/dp/portal/DpMeuCalendario.tsx`: trocar os `throw new Error(...)` de
  validação (linhas ~560–680) por `negarRegra(...)`; nada muda no visual das telas.
- Testes: unitário de `notifyError` (regra → sem registro, com a frase da regra; erro
  comum → registra) e das validações do calendário.
- Atualização de status dos seis erros resolvidos na tabela de auditoria (somente
  status e nota, sem apagar histórico). Sem migração de estrutura, sem publicar.
