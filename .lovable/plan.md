# Ajustes no cadastro de sócio e sugestão de gênero

## 1. Data de entrada do sócio

No cadastro, quando o vínculo é sócio, o campo hoje chamado "Data de admissão" passa a se chamar **"Início na sociedade"** (com explicação curta). Continua obrigatório, e segue servindo de marco para contagem de tempo e histórico.

Também deixam de aparecer para o sócio as mensagens de erro escritas em termos de admissão (idade mínima na admissão passa a falar em "no início na sociedade").

## 2. Perfil de acesso do sócio

- Ao escolher o vínculo sócio, o perfil de acesso já vem como **Gestor**.
- A pessoa pode mudar; se escolher **Colaborador**, aparece um aviso explicando que sócio normalmente precisa de acesso de gestor.
- Não sobrescreve escolha manual: se o usuário já mexeu no perfil, a sugestão não volta atrás.

## 3. Sugestão de gênero pelo nome

- Ao digitar o nome completo, o sistema sugere o gênero pelo primeiro nome (lista de nomes brasileiros mais comuns + terminações típicas, ex.: "-a", "-ana", "-ilson").
- A sugestão só preenche quando o gênero ainda está vazio, e mostra um rótulo "sugerido pelo nome" que desaparece se a pessoa alterar.
- Nomes ambíguos (ex.: Alex, Darci) não sugerem nada.
- Vale também no cadastro pela ficha importada.

## 4. Pró-labore como referência do cargo de sócio na unidade

Hoje a conferência de salário do cargo é ignorada para sócio, então salvar o pró-labore do Luiz não perguntou nada.

- Ao salvar um sócio com pró-labore, cargo e unidade específicos, o sistema pergunta se o valor deve virar a **referência salarial daquele cargo de sócio naquela unidade** (opções: usar como referência / manter só neste sócio).
- Sócio cadastrado como "Geral (todas as unidades)" não recebe a pergunta.
- Se o cargo de sócio já tiver referência diferente, a pergunta mostra os dois valores e permite atualizar a referência ou manter a divergência com justificativa, como já ocorre nos demais cargos.

### Piso deixa de ser "do sindicato" para sócio

Para cargos de sócio, todo texto e regra de piso deixa de citar sindicato patronal e passa a ser **referência/piso da empresa** por unidade: sem exigência de sindicato patronal vinculado, sem aviso de "cargo sem piso no sindicato", e a gravação da referência não fica presa a um sindicato.

## 5. Horário do sócio sem pontos de atenção trabalhista

No horário de trabalho de um sócio (opcional), os pontos de atenção da CLT (limite de 44h, interjornada, adicional noturno, folga dominical etc.) deixam de aparecer: o painel deixa de passar o sócio pela verificação trabalhista, que é um dever do empregador e não se aplica a sócio. Também não aparece o pedido de ciência ("estou ciente") ao salvar o horário do sócio.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`: rótulo/copy condicional do campo de data, sugestão de perfil `gestor` ao marcar sócio (com aviso ao escolher `colaborador`), integração da sugestão de gênero e do novo fluxo de referência salarial do sócio.
- `src/lib/dp/cargos.ts`: `deveReconciliarPisoCargo` passa a aceitar sócio quando há `unidadeId`, retornando a origem `empresa` (sem patronal).
- `src/lib/dp/cargoSalarios.ts`: nova origem de piso "empresa" para cargos de sócio — resolução por (cargo, unidade, data) sem `sindicato_patronal_id`; textos de origem ajustados.
- Novo `src/lib/dp/generoPorNome.ts` (dicionário + heurística de terminação, retorna `F` | `M` | `null`) usado no formulário e em `src/lib/dp/ficha-registro/payload.ts`.
- `src/lib/dp/contrato-policy.ts` (`isSocio`) segue como única fonte da detecção de sócio.
- `src/components/dp/ColaboradorJornadaPanel.tsx` + `src/lib/dp/clt-alertas.ts`: `EntradaAlertasClt` ganha `socio`; quando `true`, `verificarAlertasClt` retorna vazio e o painel não exibe avisos nem pede ciência ao salvar. O painel passa a receber/reconhecer o rótulo do vínculo do colaborador (hoje só usa `regime`, que para sócio é `pj` e por isso caía na verificação).
- Gravação da referência do sócio reaproveita `dp_cargo_salarios` com `sindicato_patronal_id` nulo e `unidade_id` preenchido; sem mudança de schema.
- Testes novos em `src/lib/dp/__tests__/`: `genero-por-nome.test.ts` e casos de sócio em `cargoSalarios`/`cargos`.
- Verificação: `bunx tsgo --noEmit`, `bunx vitest run src/lib/dp src/test` e conferência no navegador do cadastro do sócio (data, perfil, gênero sugerido, pergunta do pró-labore).
