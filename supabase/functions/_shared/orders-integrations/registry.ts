// Registro de adaptadores. Um provedor só é integrável se estiver aqui.
// Nenhum marketplace real é registrado nesta fase: fazê-lo exige
// documentação oficial, credenciais, homologação e aprovação específica.
import { PermanentIntegrationError, type IntegrationProvider, type OrdersAdapter } from "./types.ts";
import { sandboxAdapter } from "./adapters/sandbox.ts";

const ADAPTERS: Partial<Record<IntegrationProvider, OrdersAdapter>> = {
  sandbox: sandboxAdapter,
};

export function getAdapter(provider: string): OrdersAdapter {
  const adapter = ADAPTERS[provider as IntegrationProvider];
  if (!adapter) {
    throw new PermanentIntegrationError(
      "no_adapter",
      `Nenhum adaptador homologado para o provedor ${provider}.`,
    );
  }
  return adapter;
}

export function hasAdapter(provider: string): boolean {
  return Boolean(ADAPTERS[provider as IntegrationProvider]);
}

export function registeredProviders(): IntegrationProvider[] {
  return Object.keys(ADAPTERS) as IntegrationProvider[];
}
