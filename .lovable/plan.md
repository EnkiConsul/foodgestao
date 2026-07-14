# Teste E2E do Módulo DP

## Objetivo
Rodar um smoke test automatizado (Playwright headless, autenticado com sua sessão) em **todas as telas do menu DP** e do **Portal do Colaborador**, comparando o comportamento com o repositório de referência `pakere1996/portalcolaborador`. Entrega final: **relatório de bugs** com status por tela + screenshots. Não corrijo bugs neste passo — cada correção vira uma tarefa separada depois que você aprovar.

## Escopo

### Admin DP 360° (`/dp/*`)
| Grupo | Tela | O que testo |
|---|---|---|
| Início | `/dp` | Cards Pendências / Aniversariantes / Atalhos renderizam, sem erro no console |
| Cadastro | Colaboradores, Cargos, Unidades, Sindicatos, Negociações Coletivas | Lista carrega, botão "Novo" abre dialog, criar 1 registro de teste, editar, excluir |
| Folgas | Calendário Geral, Solicitações, Aprovações, Trocas, Datas Bloqueadas | Lista carrega, filtros funcionam, criar solicitação → aprovar → verificar reflexo no calendário |
| Documentos | Contracheques, Adiantamentos, Ponto, Atestados, Disciplinares, ACT-CCT, Histórico | Categoria filtra corretamente, upload de 1 PDF dummy, download, exclusão |
| Comunicação | Mensagens, Quadro de Avisos | Criar aviso, marcar como lido, enviar mensagem |
| Folha (fora do menu) | `/dp/folha`, aprovações, período | Verificar se rota abre sem erro (não está no menu — reporto se deve entrar) |

### Portal do Colaborador (`/dp/meu/*`)
Início, Perfil, Solicitações (criar folga), Trocas (propor troca), Documentos (visualizar próprio contracheque).

## Estratégia de dados

O repo do Pakerê **não tem seed.sql**, só migrations e edge functions. Então:

1. **Antes do teste**, verifico se sua base já tem dados nas tabelas `dp_colaboradores`, `dp_cargos`, `dp_unidades`, etc.
2. Se estiver vazia, **insiro um dataset mínimo** ligado à sua `company_id` atual via `psql`:
   - 1 unidade "Matriz Teste"
   - 2 cargos ("Atendente", "Gerente")
   - 3 colaboradores fictícios (incluindo um vinculado ao seu `auth.uid()` para testar o Portal)
   - 1 sindicato + 1 negociação
   - 1 solicitação de folga pendente + 1 aprovada
   - 1 aviso ativo
3. Uso prefixo `TESTE_E2E_` nos nomes para facilitar limpeza depois.
4. **Não mexo em produção** de outras companies — tudo escopado à sua `company_id`.

## Execução (Playwright)

- Sessão restaurada via `LOVABLE_BROWSER_SUPABASE_*` (já disponível).
- Para cada tela: `goto` → aguarda `networkidle` → screenshot → executa ações críticas → captura erros de `console` e `pageerror`.
- Ações que exigem clique: usam `getByRole` / `getByLabel` (nunca seletor CSS frágil).
- Todos os artefatos em `/tmp/browser/dp-e2e/` (screenshots + log JSON).

## Entrega

Ao final, você recebe **em uma única resposta**:

```text
Tela                          Status   Observações
────────────────────────────  ───────  ─────────────────────────────────
/dp                           OK       —
/dp/colaboradores             OK       Criar/editar/excluir OK
/dp/cadastros/cargos          BUG      Botão "Novo" não abre dialog
/dp/folgas                    OK       —
/dp/solicitacoes              PARCIAL  Filtro "status" não aplica
...
```

+ pasta de screenshots + lista final numerada de bugs encontrados, cada um com: rota, passo que quebrou, mensagem de erro, screenshot.

## Fora de escopo (pergunte depois se quiser)
- Corrigir os bugs encontrados
- Escrever testes automatizados versionados no repo (`*.test.tsx`)
- Testar fluxos financeiros do DP (integração folha → contas a pagar)
- Testar RLS de outras companies
- Limpar os dados `TESTE_E2E_` após rodar (posso fazer se pedir)

## Detalhes técnicos
- Ferramenta: Playwright + Python (já instalado no sandbox).
- Autenticação: restauração de sessão Supabase existente, sem criar usuário novo.
- Seed: `INSERT` direto via `psql` (acesso já configurado), escopado à `company_id` da sua sessão atual.
- Referência: leitura das páginas em `pakere1996/portalcolaborador/src/pages/dp/**` para saber quais ações cada tela deve suportar; comparação apenas comportamental, não visual.
