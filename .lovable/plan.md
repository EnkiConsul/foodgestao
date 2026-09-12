# Atalhos do Início mais compactos e card de aniversariantes reorganizado

## 1. Atalhos dos menus (aba Início, celular)

- Deixar os atalhos menores: ícone reduzido, rótulo em fonte menor, menos espaçamento.
- O usuário escolhe quantos ícones por linha: **5, 4 ou 3**. Um seletor discreto fica no canto da faixa de atalhos.
- O tamanho do ícone e do texto se ajusta ao formato escolhido: 5 por linha = menor, 3 por linha = maior.
- A escolha é lembrada por usuário e por empresa (guardada nas preferências existentes, sem nova tabela).
- Padrão inicial: 5 por linha.

## 2. Card de aniversariantes

Cada pessoa passa a ocupar 4 linhas, aproveitando toda a largura:

```text
ERILDSON SOUSA SILVA JÚNIOR
Contratação                        2 anos de casa
PAKERÊ GARAVELO                    (relógio) Faltam 20 dias
WhatsApp    Comunicado    E-mail
```

- Linha 1: nome completo, ocupando a linha inteira.
- Linha 2: tipo (Nascimento ou Contratação) à esquerda; idade ou tempo de casa à direita.
- Linha 3: unidade à esquerda; ícone de relógio com dias restantes à direita ("Hoje" quando for o dia).
- Linha 4: três ações — WhatsApp (mensagem pronta, como hoje), Comunicado (mensagem interna, como hoje) e E-mail.
- O selo de dia/mês continua à esquerda do bloco.
- No portal do colaborador o card segue sem as ações, como hoje.

### E-mail

O botão de e-mail abre o aplicativo de e-mail do próprio usuário já com o destinatário preenchido, usando o e-mail cadastrado do colaborador. Quando não houver e-mail cadastrado, o botão aparece desabilitado com aviso "Sem e-mail cadastrado".

## Detalhes técnicos

- `src/components/dp/home/MenusPrincipaisCards.tsx`: grid dinâmico (`grid-cols-3|4|5`), escalas de ícone/texto por densidade, seletor de formato; preferência lida/gravada em `useDpUserPrefs` (`extras.home_atalhos_cols`).
- `src/components/dp/home/AniversariantesCard.tsx`: reestruturar cada item em 4 linhas com `justify-between`; ações em linha própria com botões `size="sm"`; ícone `Clock` do lucide.
- `src/hooks/useDpAniversariantes30d.tsx`: incluir `email` no select e no tipo `AnivItem` para habilitar a ação de e-mail.
- Sem mudanças de banco de dados.
