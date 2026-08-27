/**
 * Os tipos gerados do banco declaram todo parâmetro de RPC como obrigatório e
 * não-nulo, mesmo quando a função SQL tem `default null`. Passar `null` nesses
 * casos é o comportamento correto (usa o default da função), então este helper
 * documenta a intenção em um único lugar — sem `any` e sem supressão de erro.
 */
export function optionalRpcArg<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}
