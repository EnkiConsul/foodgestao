# "Cadastro incompleto" só quando faltar informação obrigatória

Hoje o selo conta qualquer campo em falta (setor, e-mail, endereço, PIS…). Passa a contar só os obrigatórios que você definiu:

**Obrigatórios:** salário, telefone ou WhatsApp, tipo de vínculo.

## O que muda

- O selo **"Cadastro incompleto (N)"** (cartão do celular e tabela do computador) só aparece quando falta salário, contato ou vínculo — e o N conta só esses.
- A aba **Incompletos (N)** e o filtro "Só cadastros incompletos" seguem a mesma regra.
- A pendência **"Completar cadastro de …"** no painel do DP idem: só entra quem deve campo obrigatório.
- O aviso no topo da ficha do colaborador continua listando tudo o que falta (inclusive os opcionais, como endereço e PIS), mas com os obrigatórios destacados primeiro, marcados como obrigatórios.
- Na tela de conferência da ficha importada, o resumo "Falta: …" passa a separar: obrigatórios em destaque, opcionais como sugestão.

## Detalhes técnicos

- `src/lib/dp/cadastro-completude.ts`: `CampoEssencial` ganha `obrigatorio: boolean`; novos helpers `camposFaltandoObrigatorios(c, opts)` e `cadastroIncompleto` passa a olhar só obrigatórios. `camposFaltando` continua retornando todos (uso informativo na ficha).
- `DpColaboradores.tsx`: `faltantesDe` passa a usar só obrigatórios (selo, aba, filtro, ordenação).
- `useDpPendencias.tsx`: bloco de cadastro incompleto filtra por obrigatórios.
- `ColaboradorFichaDialog.tsx` e `FichaRevisaoCard.tsx`: listam tudo, com obrigatórios sinalizados ("obrigatório") e ordenados primeiro.
- Testes de `cadastroCompletude.test.ts` atualizados para a nova regra.
- Sem mudanças de banco, RLS ou edge function.
