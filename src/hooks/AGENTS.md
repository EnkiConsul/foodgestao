# Regras de src/hooks

- Salário-família: cada reajuste é uma linha em `dp_salario_familia_tabelas` (data de início, exclusão lógica); a vigente é espelhada em `dp_config_dp` por `useDpSalarioFamiliaTabelas` — histórico preservado sem mudar quem lê o valor.
