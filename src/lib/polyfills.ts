// ------------------------------------------------------------------
// Polyfills de recursos novos do JavaScript que ainda faltam em
// navegadores um pouco mais antigos.
// ------------------------------------------------------------------

// Map.prototype.getOrInsert / getOrInsertComputed (ES2025).
// O pdfjs 6.x usa esses métodos para cachear chamadas ao worker; sem eles o
// visualizador de PDF quebra com "getOrInsertComputed is not a function" e a
// tela fica em branco em navegadores sem suporte (Chromium < ~135, Safari
// mais antigo).
declare global {
  interface Map<K, V> {
    getOrInsert(key: K, value: V): V;
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V;
  }
}

if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsert = function <K, V>(this: Map<K, V>, key: K, value: V): V {
    if (!this.has(key)) this.set(key, value);
    return this.get(key) as V;
  };
  Map.prototype.getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    key: K,
    callbackfn: (key: K) => V,
  ): V {
    if (!this.has(key)) this.set(key, callbackfn(key));
    return this.get(key) as V;
  };
}

// Math.sumPrecise (ES2025): soma exata usada pelo pdfjs 6.4 ao compor cores
// e transparências. Sem ele cada página renderizada loga aviso e pode sair
// com cores erradas em navegadores mais antigos.
declare global {
  interface Math {
    sumPrecise(values: Iterable<number>): number;
  }
}

if (!Math.sumPrecise) {
  Math.sumPrecise = (values: Iterable<number>): number => {
    let total = 0;
    for (const v of values) total += v;
    return total;
  };
}

export {};
