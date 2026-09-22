# Rascunho no link de admissão (convite do gestor e ficha do candidato)

Hoje o rascunho só existe no cadastro manual do colaborador. No convite de pré-admissão nada é guardado: se o gestor fechar a janela, perde o que digitou. Na ficha aberta pelo link, o que é preenchido já fica guardado no servidor, mas isso só aparece depois do primeiro salvamento — o candidato não sabe que pode sair e voltar.

## 1. Convite do gestor (janela "Convidar Candidato Para Preencher")

- Guardar rascunho automaticamente: nome, CPF, WhatsApp, prazo do link, unidade, cargo, tipo de vínculo e a resposta sobre trabalho após 22h.
- Gravação automática após a pausa na digitação, com a frase discreta no rodapé "Rascunho salvo às HH:MM".
- Ao reabrir com rascunho guardado, um aviso no topo: "Rascunho de DD/MM às HH:MM" com "Retomar Preenchimento" e "Começar Do Zero".
- Rascunhos separados: convite comum e promoção de folguista (um por pessoa), para nunca misturar dados de candidatos.
- O rascunho é descartado assim que o convite é criado ou quando o gestor escolhe "Começar Do Zero".
- Quando o convite nasce da promoção de folguista, os dados já conhecidos continuam preenchendo a janela; o rascunho só prevalece se tiver algo digitado depois.

## 2. Ficha do candidato (link enviado pelo WhatsApp)

- Deixar claro desde a abertura: aviso fixo "O que você preencher fica guardado. Pode sair e voltar por este mesmo link."
- Guardar sozinho ao passar de etapa (já acontece) e também após a pausa na digitação, sem tirar o candidato do lugar.
- O botão "Guardar" passa a ser "Guardar E Continuar Depois", e o rodapé mostra sempre o horário do último rascunho.
- Nada muda no envio final, nas validações ou nos documentos.

## Detalhes técnicos

- Reaproveitar `dp_admissao_rascunhos` e `useDpAdmissaoRascunho` (sem migration). Novas chaves em `src/lib/dp/admissao-rascunho.ts`: `chaveRascunhoConvite({ pessoaApoioId })` → `convite` ou `convite:apoio:<id>`.
- Novo conteúdo tipado `ConteudoRascunhoConvite` (campos do convite) e `rascunhoConviteTemConteudo` (só guarda com nome, CPF, WhatsApp, unidade ou cargo preenchidos).
- `PreadmissaoConviteDialog.tsx`: usar o hook (carregar no `open`, `agendar` a cada mudança, `descartar` após `criar.mutateAsync` e no "Começar Do Zero"); aviso de retomada acima do formulário; rótulos por `rotuloRascunho`/`rotuloSalvoEm`.
- `src/pages/PreAdmissao.tsx`: `useEffect` com atraso (~2 s) chamando `salvar(false)` em silêncio quando `form`/`pessoas` mudarem e não houver envio em curso, sem `toast`; aviso fixo de retomada; rótulo do botão.
- Testes: casos novos em `src/lib/dp/__tests__/admissao-rascunho.test.ts` para as chaves e o conteúdo do convite. Validação com `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json` e ESLint. Nada publicado.
