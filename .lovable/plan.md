# Promover folguista por importação de ficha ou link de admissão

Hoje, ao clicar em "Promover a Colaborador" (Stefane, folguista), o sistema abre direto o cadastro manual. As outras duas formas de cadastrar — importar a ficha de registro e enviar o link de pré-admissão — só existem no botão de novo cadastro, e não aproveitam os dados já digitados do folguista.

## O que muda para você

1. Ao promover um folguista ou pessoa em teste, aparece a mesma escolha de sempre, com três caminhos:
   - Cadastro manual (como hoje).
   - Importar ficha de registro: já entra na tela de envio do PDF, com o nome e o CPF do folguista como referência da conferência.
   - Enviar link de admissão: abre o convite já preenchido com nome, WhatsApp, CPF, cargo e unidade do folguista; você só confirma o vínculo, o trabalho após 22h e o prazo.
2. O caminho escolhido fica amarrado à pessoa: quando o cadastro for concluído (pela ficha ou pelo link), o folguista passa automaticamente a constar como "já promovido a colaborador", sem promoção duplicada.
3. Enquanto o link estiver em andamento, a lista mostra que já existe uma admissão em andamento para aquela pessoa, evitando enviar dois convites.
4. Se o CPF do folguista já tiver cadastro ou ficha em andamento, o aviso continua aparecendo antes de criar o convite, como hoje.

## Como fica por dentro

- Novo diálogo `PromoverApoioMetodoDialog` reusando o padrão de `NovoCadastroMetodoDialog`; `DpColaboradores.tsx` passa a abrir esse diálogo em `setTransformando` e só chama `ColaboradorFormDialog` quando o método for manual.
- `PreadmissaoConviteDialog` recebe props opcionais de pré-preenchimento (nome, whatsapp, cpf, cargo, unidade) e o id da pessoa de apoio; `PreadmissoesPanel` e a rota `/dp/colaboradores/pre-admissoes` aceitam esses dados por estado de navegação.
- Migration (exclusão lógica preservada, reversível): coluna `pessoa_apoio_id uuid` em `dp_preadmissoes` e em `dp_ficha_importacao_itens`, com índice parcial e validação de mesma empresa via helper privado. Sem apagar nada.
- As RPCs oficiais `dp_preadmissao_convite_criar`, `dp_preadmissao_efetivar`, `dp_preadmissao_efetivar_com_ficha` e a aplicação da ficha passam a receber/propagar `p_pessoa_apoio_id`, e na efetivação gravam `dp_pessoas_apoio.colaborador_id` dentro da mesma transação, de forma idempotente e auditada (nada é escrito pelo cliente).
- A promoção por ficha usa `/dp/colaboradores/importar-ficha?apoio=<id>`; a aplicação da ficha também fecha o vínculo no servidor.
- Testes: escolha dos três caminhos, convite pré-preenchido, vínculo do folguista após efetivação (ficha e link), bloqueio de pessoa de outra empresa e idempotência da promoção. Provas em transação desfeita antes de qualquer conclusão, com contagens iguais à base.

Nada é publicado e nenhum dado existente é alterado além do vínculo da pessoa promovida.
