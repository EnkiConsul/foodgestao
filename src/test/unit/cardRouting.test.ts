import { describe, it, expect } from "vitest";
import {
  routeStagingRows,
  isCardPluggyAccount,
  creditCardLabel,
  type CardRoutingMaps,
} from "@/lib/conciliacao/cardRouting";

const maps: CardRoutingMaps = {
  cardPluggyAccounts: new Set(["pa-card-ok", "pa-card-pending"]),
  cardByPluggyAccount: { "pa-card-ok": "card-1" },
};

const origem: Record<string, string> = {
  a: "pa-bank",
  b: "pa-card-ok",
  c: "pa-card-pending",
  d: "pa-card-ok",
};

describe("cardRouting", () => {
  it("identifica contas de cartão", () => {
    expect(isCardPluggyAccount("pa-card-ok", maps)).toBe(true);
    expect(isCardPluggyAccount("pa-card-pending", maps)).toBe(true);
    expect(isCardPluggyAccount("pa-bank", maps)).toBe(false);
  });

  it("separa linhas entre cartão, banco e bloqueadas", () => {
    const out = routeStagingRows(["a", "b", "c", "d"], (id) => origem[id], maps);
    expect(out.bankIds).toEqual(["a"]);
    expect(out.byCard).toEqual({ "card-1": ["b", "d"] });
    expect(out.blockedIds).toEqual(["c"]);
  });

  it("trata linha sem conta de origem como banco", () => {
    const out = routeStagingRows(["x"], () => undefined, maps);
    expect(out.bankIds).toEqual(["x"]);
    expect(out.blockedIds).toEqual([]);
  });

  it("monta o rótulo do cartão", () => {
    expect(creditCardLabel({ id: "1", brand: "Visa", last4: "1234", issuer: null })).toBe("Visa •••• 1234");
    expect(creditCardLabel({ id: "1", brand: null, last4: null, issuer: "BTG" })).toBe("BTG");
    expect(creditCardLabel(null)).toBeNull();
  });
});
