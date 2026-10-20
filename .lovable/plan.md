# Diagnóstico (somente leitura) — dados empresariais da Pakerê

Consultas SELECT reais no banco do AVETO 360. Nada foi alterado.

## Empresa (tabela `companies`)
- Razão social (campo `name`): Pakere Pizzaria
- Nome fantasia (`trade_name`): vazio
- CNPJ: 06.002.178/0001-58
- Município/UF, CEP, endereço: vazios
- Ativa: sim (`is_active`); situação `trial`; tipo empresarial
- Criada em 14/07/2026
- ID de origem (só referência): b0d450a7-0a70-4322-bcdb-c3abfea196ba

## Unidades (tabela `dp_unidades`)
| Unidade | CNPJ | Endereço | Município/UF | Ativa | ID de origem |
|---|---|---|---|---|---|
| PAKERÊ GARAVELO | 06.002.178/0001-58 | Rua 9A Qd 10 Lt 03, Setor Garavelo | Aparecida de Goiânia / (UF vazia) | sim | 9d412df7-cf07-4a11-8735-af452d2d875c |
| PAKERÊ T-63 | 62.823.445/0001-29 | Av. T-63 Qd 350 Lt 01/20, Sala 01 e 02 | Goiânia / AM (provável erro; esperado GO) | sim | afd5ac01-d53a-4bc2-acd8-d6ea2b3ed324 |

## Matriz/unidade
- Não existe campo de matriz/filial no banco; a relação é só "unidade pertence à empresa".
- Garavelo tem o mesmo CNPJ da empresa (equivale à matriz, por inferência).
- T-63 tem outra raiz de CNPJ: é outra pessoa jurídica, não filial. Não comprovado como matriz/filial.

## Ausentes ou não comprovados
- Nome fantasia, endereço, cidade, UF e CEP da empresa.
- UF da Garavelo; UF da T-63 (gravada AM); número, bairro e CEP das duas unidades.
- Situação cadastral dos CNPJs na Receita (não consultada).

## Sobre os IDs
Os IDs acima são do banco do AVETO e servem apenas como referência de origem. O novo projeto deve gerar IDs próprios e, se precisar ligar os dois, guardar o ID de origem num campo separado — nunca usá-lo como identidade, porque bancos, permissões e contas de acesso são independentes.

## Próximo passo sugerido
Corrigir no novo projeto (não no AVETO) a UF das unidades e confirmar com a Pakerê o nome fantasia e se a T-63 é empresa separada.
