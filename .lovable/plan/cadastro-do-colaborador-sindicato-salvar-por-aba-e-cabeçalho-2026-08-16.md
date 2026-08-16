# Cadastro do colaborador: sindicato, salvar por aba e cabeçalho fixo

## 1. Enquadramento sindical aparece vazio (causa confirmada)

Os vínculos existem no banco (4 cargos ligados ao SECHSEG laboral e 3 unidades ligadas a sindicatos patronais) e as regras de acesso permitem a leitura. O problema é no hook `useSindicatoDoCargo`: ele declara `initialData` com o objeto vazio (`laboral: null, patronal: null`). Como o cache do app considera dados frescos por 30 segundos, a consulta real não roda ao abrir a tela — o formulário mostra "o cargo ainda não tem sindicato laboral" com um dado vazio de placeholder. O mesmo ocorre a cada troca de cargo/unidade.

O que muda:

- Remover o `initialData` vazio; a tela passa a distinguir "carregando" de "sem vínculo".
- Enquanto carrega, cada coluna (Laboral / Patronal) mostra um estado de carregamento curto, em vez do aviso de ausência.
- Só depois da resposta o bloco decide entre resumo preenchido (nome, CNPJ, data-base, negociação vigente) e a ação de vincular/cadastrar.
- Laboral: se o cargo tiver mais de um sindicato vinculado, usar o laboral ativo (ignorando inativos), com o mesmo critério aplicado ao patronal da unidade.
- Patronal: quando a unidade ainda não tem vínculo e a empresa tem exatamente um sindicato patronal cadastrado, exibir como sugestão com um clique para vincular à unidade (nada é gravado sem o clique).
- O `sindicato_id` do colaborador continua alinhado ao laboral do cargo, agora só depois do carregamento (evita gravar nulo por leitura precoce).

## 2. "Salvar e continuar" no Horário de Trabalho reclamando de remuneração

Salvar a aba Horário de Trabalho não valida remuneração — mas, ao gravar um colaborador já existente, o sistema sempre dispara o aviso "Falta completar a remuneração — A folha só é gerada depois disso", que aparece como se tivesse travado o salvamento, junto com o ponto vermelho na aba Remuneração.

O que muda:

- Esse aviso passa a aparecer somente quando a aba Remuneração é validada (ao clicar em Concluir ou ao salvar dentro da própria aba). Salvar Dados ou Horário de Trabalho não menciona mais remuneração.
- Mensagem de sucesso do checkpoint fica específica da aba salva ("Horário de trabalho salvo", "Dados salvos").
- Confirmar que nenhum outro gate de remuneração (reconciliação de cargo/salário, isonomia de benefícios) roda fora da aba Remuneração.

## 3. Cabeçalho e abas fixos na edição

Hoje todo o conteúdo do diálogo rola junto, levando título e abas para fora da tela.

O que muda: o diálogo passa a ter três áreas — cabeçalho + abas fixos no topo, conteúdo rolável no meio e rodapé de botões fixo embaixo. Ao rolar um formulário longo, as abas continuam visíveis e clicáveis.

## Detalhes técnicos

- `src/hooks/useSindicatoDoCargo.tsx`: remover `initialData`, retornar também `isLoading`; filtrar `ativo !== false` na escolha do laboral/patronal; manter as consultas de negociação vigente.
- `src/components/dp/SindicatoEnquadramentoField.tsx`: estados `carregando` por coluna; sugestão de patronal único da empresa reaproveitando `vincularExistente(id, "patronal")`; efeito de `onChange` só quando `!isLoading`.
- `src/components/dp/ColaboradorFormDialog.tsx`:
  - `DialogContent` com `flex h-[92vh] flex-col overflow-hidden p-0`; `DialogHeader` + `TabsList` em bloco fixo com borda; `TabsContent` dentro de um wrapper `flex-1 overflow-y-auto` (o `contentRef` de foco automático continua nesse wrapper para o `scrollIntoView` funcionar); `DialogFooter` fixo com borda superior.
  - No `submit`, o aviso de `pendencia` passa a depender de `validaRem`.
- Sem migração de banco e sem mudança de regras de acesso.
