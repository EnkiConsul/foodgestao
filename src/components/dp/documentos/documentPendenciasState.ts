/** Um retrato anterior pode ser exibido, mas não confirma ausência durante uma nova consulta. */
export function documentPendenciasState({
  ready, isLoading, isFetching, isRefreshing, isError,
}: {
  ready: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isRefreshing: boolean;
  isError: boolean;
}) {
  const atualizando = isLoading || isFetching || isRefreshing;
  const falhou = isError && !atualizando;
  const carregando = !ready && !falhou;
  return {
    atualizando,
    falhou,
    carregando,
    podeConfirmarVazio: ready && !isError && !atualizando,
  };
}