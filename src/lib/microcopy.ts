/**
 * Microcopy centralizado para consistência de linguagem em toda a aplicação.
 * Tom: direto, próximo, em português do Brasil. Sem jargão técnico.
 */

export const microcopy = {
  loading: {
    default: "Carregando...",
    data: "Carregando dados...",
    saving: "Salvando...",
    deleting: "Excluindo...",
    processing: "Processando...",
  },
  empty: {
    generic: {
      title: "Nada por aqui ainda",
      description: "Quando houver conteúdo, ele aparecerá nesta lista.",
    },
    search: {
      title: "Nenhum resultado encontrado",
      description: "Tente ajustar os filtros ou usar outros termos de busca.",
    },
    error: {
      title: "Não foi possível carregar",
      description: "Verifique sua conexão e tente novamente.",
    },
  },
  actions: {
    create: "Adicionar",
    edit: "Editar",
    delete: "Excluir",
    save: "Salvar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    retry: "Tentar novamente",
    back: "Voltar",
    close: "Fechar",
    search: "Buscar",
    filter: "Filtrar",
    clear: "Limpar",
    export: "Exportar",
  },
  toast: {
    saved: "Alterações salvas",
    created: "Registro criado",
    updated: "Registro atualizado",
    deleted: "Registro excluído",
    error: "Algo deu errado. Tente novamente.",
    unauthorized: "Você não tem permissão para esta ação.",
  },
} as const;
