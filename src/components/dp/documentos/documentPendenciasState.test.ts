import { describe, expect, it } from "vitest";
import { documentPendenciasState } from "./documentPendenciasState";

const concluido = { ready: true, isLoading: false, isFetching: false, isRefreshing: false, isError: false };

describe("confirmação das pendências de documentos", () => {
  it("não confirma ausência durante o primeiro carregamento", () => {
    const estado = documentPendenciasState({ ...concluido, ready: false, isLoading: true, isFetching: true });
    expect(estado.carregando).toBe(true);
    expect(estado.podeConfirmarVazio).toBe(false);
  });
  it("encerra o carregamento e indica falha sem retrato anterior", () => {
    const estado = documentPendenciasState({ ...concluido, ready: false, isError: true });
    expect(estado.carregando).toBe(false);
    expect(estado.falhou).toBe(true);
    expect(estado.podeConfirmarVazio).toBe(false);
  });
  it("não confirma ausência com retrato antigo após uma falha", () => {
    expect(documentPendenciasState({ ...concluido, isError: true }).podeConfirmarVazio).toBe(false);
  });
  it("não confirma ausência ao atualizar um retrato vazio", () => {
    expect(documentPendenciasState({ ...concluido, isFetching: true }).podeConfirmarVazio).toBe(false);
  });
  it("troca a falha por atualização ao tentar novamente", () => {
    const estado = documentPendenciasState({ ...concluido, ready: false, isError: true, isRefreshing: true });
    expect(estado.falhou).toBe(false);
    expect(estado.atualizando).toBe(true);
    expect(estado.podeConfirmarVazio).toBe(false);
  });
  it("confirma ausência somente após consulta concluída sem erro", () => {
    expect(documentPendenciasState(concluido).podeConfirmarVazio).toBe(true);
  });
});