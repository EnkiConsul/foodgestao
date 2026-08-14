# Cadastro de colaborador: vínculo, forma de pagamento e freelancer

Hoje o cadastro oferece as três formas de pagamento (mensalista, horista, diarista) para qualquer vínculo — inclusive Intermitente, que por lei não tem salário mensal fixo. E não existe opção para o freelancer sem registro, situação real de muitas operações de food service.

## 1. Forma de pagamento passa a depender do vínculo

A política de contrato (`contrato-policy.ts`) passa a declarar quais formas de pagamento cada vínculo aceita, e o seletor só mostra essas opções:

- CLT efetivo / Estagiário / Temporário: Mensalista (padrão), Horista, Diarista
- CLT intermitente: Horista (padrão), Diarista — mensalista deixa de existir
- PJ / Sócio: Mensalista (pró-labore ou contrato fixo), Horista, Diarista
- Freelancer: Diarista (padrão), Horista

Ao trocar o vínculo, se a forma atual não for permitida, o formulário passa automaticamente para a forma padrão daquele vínculo e mostra uma nota curta explicando. Adiantamento quinzenal continua restrito a mensalista com folha (CLT efetivo/estágio/temporário).

## 2. Novo vínculo: Freelancer (sem registro)

- Pago por diária/hora, **fora da folha CLT**: não entra em períodos de folha, não gera holerite nem INSS/IRRF/FGTS. O pagamento é despesa avulsa, como PJ.
- Continua participando de Escala, Operação do Dia e Ponto (para controle de presença e do valor a pagar).
- Rescisão, férias, 13º e provisões não se aplicam.

## 3. Ciência do risco ao escolher Freelancer

Ao selecionar Freelancer, abre um diálogo de ciência legal (mesmo padrão do intervalo intrajornada do turno): explica que trabalho habitual sem registro pode ser reconhecido como vínculo empregatício (arts. 2º e 3º da CLT) e que a responsabilidade é do empregador. Sem o aceite, o vínculo não é salvo. O aceite fica registrado no histórico de regras com usuário e data.

## 4. Rótulos de vínculo mais claros

O termo "CLT" hoje confunde, porque o intermitente também é contrato celetista. A lista fica assim:

CLT efetivo · CLT intermitente · Estagiário · Temporário · PJ · Sócio · Freelancer (sem registro)

"Autônomo" sai da lista — quem trabalha por conta própria sem registro passa a ser Freelancer, e quem tem contrato de prestação de serviço é PJ. Colaboradores já cadastrados como Autônomo estão gravados como PJ no banco e aparecerão como PJ na edição; nenhum dado é perdido. "Sócio" continua com regras de PJ (fora da folha CLT), apenas com rótulo próprio.

## Riscos e recomendações

- **Dado já existente incompatível**: há 1 colaborador intermitente gravado como mensalista hoje. Ao restringir as opções, esse cadastro fica com uma forma inválida. Recomendação: converter esse registro para horista na mesma entrega, pedindo o valor da hora (o campo entra como pendência de remuneração até ser preenchido) em vez de inventar um valor.
- **Adicionar valor ao enum do banco é definitivo**: `freelancer` não pode ser removido depois sem recriar o tipo. Por isso vale acrescentar só esse valor agora, e manter Sócio/Autônomo como rótulos de tela sobre o regime `pj`, sem novos valores de enum.
- **Rótulo vs. regime**: Sócio e PJ compartilham o regime `pj`, então o rótulo escolhido não é reconstituível na edição (hoje ambos voltam como "PJ"). Recomendação: guardar o rótulo escolhido num campo próprio de exibição do colaborador para que Sócio volte como Sócio.
- **Onde o freelancer é pago**: como ele fica fora da folha, hoje não existe caminho de pagamento para ele — e o módulo Folha está pausado em desenvolvimento. Recomendação: nesta entrega apenas marcar o vínculo e a diária/hora; o "acerto avulso" (lançamento de despesa a partir dos dias trabalhados) fica para quando a Folha voltar, para não criar um fluxo financeiro paralelo.
- **Risco jurídico do registro**: manter escala e ponto de freelancer é ótimo para gestão, mas é também prova de habitualidade. O diálogo de ciência deve dizer isso com clareza, e o histórico do aceite (usuário, data, IP) é o que protege a plataforma.
- **Escopo de código**: a mudança toca cadastro, política de contrato e filtros de folha. Não altera escala, ponto nem relatórios — o que reduz o risco de regressão, e os testes de política cobrem cada vínculo.

## Detalhes técnicos

- Banco: adicionar `freelancer` ao enum `dp_regime_trabalho`. Sem mudança de tabelas.
- `src/lib/dp/contrato-policy.ts`: novos campos `formasPagamento: FormaPagamento[]`, `formaPagamentoPadrao`, `entraNaFolha`, `exigeCienciaSemRegistro` + política `FREELANCER`. `src/lib/dp/remuneracao.ts` passa a derivar `formaPagamentoPadrao`/opções da política em vez de constante fixa.
- `src/components/dp/RemuneracaoFields.tsx`: recebe as opções permitidas via prop; `src/components/dp/ColaboradorFormDialog.tsx` ajusta `TIPOS_VINCULO` (rótulos CLT efetivo/CLT intermitente, Sócio mantido, Autônomo removido), `VINCULO_TO_REGIME`/`REGIME_TO_VINCULO` e aciona o `CienciaLegalDialog` no submit quando o regime exige.
- Folha: `dp_folha_gerar_lancamentos` / apuração passam a ignorar regimes sem folha (`freelancer`, `pj`, `mei`) — hoje o filtro é apenas por colaborador ativo.
- Testes: casos novos em `src/lib/dp/__tests__/contrato-policy.test.ts` e `remuneracao.test.ts` cobrindo formas permitidas por vínculo e o padrão do freelancer.
