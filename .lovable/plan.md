# Setor por dia: escalar o colaborador fora do setor do cadastro

Hoje o setor existe só no cadastro do colaborador (um setor fixo por pessoa). A escala do dia não guarda setor nenhum, e a configuração de trabalho por dia da semana também não. Por isso, se a Sara é do Salão mas na quinta trabalha na Cozinha, o sistema mostra sempre "Salão".

## Forma recomendada: setor em três níveis, sempre com um vencedor claro

Em vez de mudar o cadastro da pessoa, o setor passa a ser respondido por dia, na seguinte ordem de prioridade:

```text
1. Setor do dia na escala        -> exceção pontual ("hoje ela cobre a Cozinha")
2. Setor por dia da semana       -> rotina fixa ("toda quinta e sábado na Cozinha")
3. Setor do cadastro             -> padrão da pessoa
```

O primeiro que existir vence. Nada é obrigatório: quem não usa setor continua sem ver nada novo.

## O que o gestor passa a fazer

- **Rotina fixa (dias certos da semana):** dentro do cadastro do colaborador, na aba de Turno e Jornada, cada dia da semana marcado como trabalho ganha um campo opcional "Setor neste dia". Em branco = usa o setor do cadastro.
- **Exceção de um dia só:** na Rotina do Dia e ao clicar num dia da Rotina do Mês, cada pessoa escalada tem a ação "Trocar setor do dia", com opção de observação (ex.: "cobrindo falta"). Vale só para aquela data.
- **Leitura clara:** quando o setor do dia é diferente do cadastro, aparece a marca "Cozinha (normalmente Salão)", para ninguém achar que o cadastro mudou.
- **Voltar ao padrão:** a mesma ação permite "Usar o setor do cadastro", que apaga a exceção.
- **Agrupamentos e filtros:** Rotina do Dia, Rotina do Mês e os painéis por setor passam a agrupar pelo setor daquele dia, não pelo do cadastro. O filtro de setor também.
- **Regras de folga por setor:** ao verificar quantas pessoas de um setor podem folgar num dia, o sistema considera o setor daquele dia. Assim, quem está emprestado à Cozinha na quinta conta na cota da Cozinha naquela quinta.
- **Setor só da unidade do dia:** a lista de setores oferecida é sempre a da unidade em que a pessoa está escalada, evitando misturar unidades.

## Detalhes técnicos

Banco (uma migração):
- `dp_escala_itens`: novas colunas `setor_id uuid null` (FK `dp_setores`) e `setor_observacao text null`.
- `dp_colaborador_config_dias`: nova coluna `setor_id uuid null` (FK `dp_setores`).
- Trigger de validação em ambas as tabelas: o setor precisa ser da mesma empresa e da mesma unidade do item/config; erro `SETOR_UNIDADE_INVALIDA` / `SETOR_EMPRESA_INVALIDA`, já traduzido em `traduzirErroSetor`.
- Função `dp_setor_previsto(p_colaborador uuid, p_data date)` retornando `setor_id`, `setor_nome`, `origem` (`escala` | `config_dia` | `cadastro` | `nenhum`), no mesmo espírito do horário previsto.
- `dp_operacao_dia` / panorama: expor `setor_efetivo_id`, `setor_efetivo_nome` e `setor_origem` por linha, mantendo o setor do cadastro como campo separado.
- `dp_folga_limite_dia`: ao contar ocupação de um setor, usar o setor previsto da data em vez de `dp_colaboradores.setor_id`.

Frontend:
- `src/lib/dp/setor-previsto.ts`: resolução em memória com a mesma precedência, para as telas que já carregam escala + config.
- `ColaboradorSetorField` reaproveitado por dia na aba Turno e Jornada do `ColaboradorFormDialog`.
- Ação "Trocar setor do dia" na Rotina do Dia (`DpOperacaoPanorama`) e no diálogo de dia da Rotina do Mês, gravando em `dp_escala_itens`.
- Agrupamento/filtro por setor efetivo em `src/lib/dp/operacao-panorama.ts`.
- Testes unitários da precedência e da cota de folga por setor do dia; testes de RLS/validação da unidade.

Rollback: remover as colunas `setor_id` das duas tabelas e a função `dp_setor_previsto`; o setor do cadastro volta a ser a única fonte.
