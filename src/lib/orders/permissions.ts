// Lista canônica de permissões do módulo Pedidos.
// Estas chaves são compartilhadas entre frontend e backend (jsonb em
// `company_members.permissions` e a RPC `can_use_orders_module`).
// NUNCA usar strings soltas — sempre importar daqui.

/** Chave canônica do módulo no enum `app_module` do banco. */
export const ORDERS_MODULE = "pedidos" as const;

export const ORDERS_PERMISSION_KEYS = [
  "orders.dashboard",
  "orders.manage",
  "orders.accept",
  "orders.prepare",
  "orders.dispatch",
  "orders.cancel",
  "orders.refund",
  "orders.catalog",
  "orders.settings",
  "orders.delivery",
  "orders.reports",
  "orders.customer_data",
  "orders.kitchen",
  "orders.expedition",
  "orders.print",
] as const;

export type OrdersPermissionKey = (typeof ORDERS_PERMISSION_KEYS)[number];

export const ORDERS_PERMISSION_LABELS: Record<OrdersPermissionKey, string> = {
  "orders.dashboard": "Painel de pedidos",
  "orders.manage": "Gerenciar pedidos",
  "orders.accept": "Aceitar pedidos",
  "orders.prepare": "Produção / preparo",
  "orders.dispatch": "Despachar / entregar",
  "orders.cancel": "Cancelar pedidos",
  "orders.refund": "Estornar pedidos",
  "orders.catalog": "Catálogo e produtos",
  "orders.settings": "Configurações do módulo",
  "orders.delivery": "Entregas e entregadores",
  "orders.reports": "Relatórios de pedidos",
  "orders.customer_data": "Dados de clientes",
  "orders.kitchen": "Modo cozinha",
  "orders.expedition": "Modo expedição",
  "orders.print": "Impressão de comandas",
};

/** Operações somente leitura — as demais exigem nível `edit`. */
export const ORDERS_READ_ONLY_KEYS: readonly OrdersPermissionKey[] = [
  "orders.dashboard",
  "orders.reports",
];

export function isOrdersPermissionKey(key: string): key is OrdersPermissionKey {
  return (ORDERS_PERMISSION_KEYS as readonly string[]).includes(key);
}

export function ordersOperationRequiresEdit(key: OrdersPermissionKey): boolean {
  return !ORDERS_READ_ONLY_KEYS.includes(key);
}
