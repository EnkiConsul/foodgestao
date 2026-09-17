# Regras de Admissão por combinação + tipo de vínculo no convite

## Como estruturar sem ficar confuso

Hoje a tela funciona ao contrário do que você quer: você escolhe **um** escopo lá no topo (uma unidade, um vínculo, um cargo) e só então marca cada campo. A ideia nova inverte isso: **o campo é o ponto de partida** e cada campo pode ter várias regras.

Modelo proposto para cada dado e cada documento da ficha:

```text
CARTEIRA DE TRABALHO (foto)
  Padrão da empresa:  Obrigatório  ▾        (vale para todo mundo)

  Exceções (a mais específica vence):
   • Opcional     — Unidades: Centro, Shopping   Vínculos: Intermitente   Cargos: (todos)   [editar] [remover]
   • Não pedir    — Unidades: (todas)            Vínculos: Prestador PJ, MEI               [editar] [remover]
   + Adicionar exceção
```

Ao adicionar/editar uma exceção o gestor vê um painel curto:

1. Como pedir: Obrigatório / Opcional / Não pedir
2. Unidades: seleção múltipla (nada marcado = todas)
3. Tipos de vínculo: seleção múltipla (nada marcado = todos)
4. Cargos: seleção múltipla (nada marcado = todos)

Cada lista é independente, então "Centro + Shopping" com "Intermitente" cobre as duas unidades quando o vínculo é intermitente — o sistema monta a combinação sozinho, sem o gestor precisar repetir a regra unidade por unidade.

Para não confundir, a tela ganha ainda:

- **Resumo em uma linha** por campo ("Obrigatório · 2 exceções"), com a lista de exceções aberta apenas quando o gestor clicar no campo.
- **Simulador** no topo: escolhendo unidade + vínculo + cargo, a tela mostra o resultado final de cada campo (Obrigatório / Opcional / Não pedir) exatamente como o candidato vai receber, para o gestor conferir se a combinação ficou como esperava.
- **Aviso de conflito** quando duas exceções têm a mesma especificidade e exigências diferentes, indicando qual está valendo.

Ordem de decisão (mantida): cargo vence vínculo, que vence unidade, que vence o padrão da empresa. Quanto mais listas preenchidas, mais específica é a regra.

## Tipo de vínculo no convite

No envio do link de pré-admissão, depois de Unidade e Cargo, entra **Tipo de vínculo** (Fixo/CLT, Intermitente, Estágio, Temporário, Prestador PJ, MEI, Freelancer), obrigatório. Ele passa a valer para:

- montar as regras corretas da ficha do candidato desde o primeiro acesso;
- aparecer na lista de pré-admissões e na revisão do gestor;
- já vir preenchido nos dados administrativos e na efetivação do cadastro.

## Detalhes técnicos

- `dp_admissao_regras` deixa de guardar escopo em colunas soltas e passa a ser o cabeçalho da regra (`tipo`, `chave`, `exigencia`, `padrao boolean`); três tabelas filhas (`dp_admissao_regra_unidades`, `dp_admissao_regra_cargos`, `dp_admissao_regra_regimes`) guardam a seleção múltipla, com integridade composta por `company_id` (mesmo padrão de `dp_requisito_cargos`/`dp_requisito_unidades`). Migration migra as regras existentes (uma linha filha quando havia unidade/cargo/regime, nenhuma quando era nulo), sem apagar dados; rollback documentado e não destrutivo.
- Uma única regra "padrão" por `company_id + tipo + chave` (índice único parcial `WHERE padrao`); exceções são livres.
- `dp_admissao_regras_resolver(company_id, unidade_id, cargo_id, regime)` reescrita: filtra por `NOT EXISTS` filha OU filha casando com o parâmetro, ordena por especificidade (cargo 8 + vínculo 4 + unidade 2) e cai no padrão; continua `SECURITY DEFINER`, `REVOKE PUBLIC`, `GRANT authenticated/service_role`. RLS admin/owner para escrita e leitura do colaborador da empresa, como hoje.
- Gravação da tela via RPC transacional `dp_admissao_regra_salvar(p_regra jsonb)`: valida allowlist de `chave`, `exigencia`, regimes canônicos e pertencimento de unidade/cargo à empresa, e regrava as filhas no mesmo lock (fail closed, DML direta do cliente revogada nas filhas).
- `dp_preadmissoes` ganha `regime_previsto public.dp_regime_trabalho` (nulo nos registros atuais); `dp-preadmissao-convite` exige valor canônico, `dp-preadmissao-gestor` e `dp-preadmissao-publica` passam a usá-lo no resolver e na listagem; `PreadmissaoConviteDialog`, `PreadmissoesPanel`, `PreadmissaoRevisaoDialog` e a efetivação carregam o vínculo.
- Frontend: `AdmissaoRegrasPanel` reescrita (linha por campo com resumo, editor de exceção com seleção múltipla, simulador); `PreAdmissao.tsx` continua consumindo `regras_campos` sem mudança de contrato.

## Verificação

Typecheck, lint dos arquivos alterados, testes já existentes e uma passagem pontual no navegador (criar uma exceção, conferir o simulador e enviar um convite com vínculo). Sem bateria completa de QA e sem publicar o frontend.
