/**
 * Avaliação local (no aparelho) da qualidade de uma foto de documento:
 * resolução, iluminação, contraste, reflexo e nitidez. Nada é enviado ao
 * servidor — serve só para orientar antes do envio.
 */
export type NivelProblema = "grave" | "atencao";
export type ProblemaDigitalizacao = { nivel: NivelProblema; titulo: string; dica: string };
export type ResultadoQualidade = {
  nota: "boa" | "aceitavel" | "ruim";
  problemas: ProblemaDigitalizacao[];
  largura: number;
  altura: number;
};

function carregar(arquivo: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(arquivo);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("Não foi possível ler a foto.")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export async function avaliarQualidadeImagem(arquivo: File): Promise<ResultadoQualidade> {
  const img = await carregar(arquivo);
  const largura = img.naturalWidth;
  const altura = img.naturalHeight;
  const escala = Math.min(1, 800 / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * escala));
  const h = Math.max(1, Math.round(altura * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const problemas: ProblemaDigitalizacao[] = [];
  if (!ctx) return { nota: "aceitavel", problemas, largura, altura };
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const cinza = new Float32Array(w * h);
  let soma = 0;
  let estourados = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    cinza[p] = v;
    soma += v;
    if (v >= 250) estourados++;
  }
  const n = w * h;
  const media = soma / n;
  let varSoma = 0;
  for (let p = 0; p < n; p++) varSoma += (cinza[p] - media) ** 2;
  const desvio = Math.sqrt(varSoma / n);

  // Nitidez: variância do Laplaciano.
  let lapSoma = 0, lapSoma2 = 0, lapN = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const l = cinza[p - w] + cinza[p + w] + cinza[p - 1] + cinza[p + 1] - 4 * cinza[p];
      lapSoma += l; lapSoma2 += l * l; lapN++;
    }
  }
  const lapMedia = lapN ? lapSoma / lapN : 0;
  const nitidez = lapN ? lapSoma2 / lapN - lapMedia * lapMedia : 0;

  const menorLado = Math.min(largura, altura);
  if (menorLado < 700) {
    problemas.push({ nivel: "grave", titulo: "Resolução muito baixa", dica: "Aproxime o celular até o documento ocupar quase toda a tela, ou use a câmera em vez de uma captura de tela." });
  } else if (menorLado < 1000) {
    problemas.push({ nivel: "atencao", titulo: "Resolução baixa", dica: "Aproxime um pouco mais para que letras pequenas e a assinatura fiquem legíveis." });
  }
  if (media < 70) {
    problemas.push({ nivel: "grave", titulo: "Foto escura", dica: "Vá para um local bem iluminado ou perto de uma janela. Evite usar o flash direto." });
  } else if (media < 100) {
    problemas.push({ nivel: "atencao", titulo: "Pouca iluminação", dica: "Mais luz deixa a assinatura e os números mais nítidos." });
  }
  if (estourados / n > 0.35 && desvio < 45) {
    problemas.push({ nivel: "atencao", titulo: "Reflexo ou luz estourada", dica: "Incline levemente o celular para tirar o brilho de cima do papel e desligue o flash." });
  }
  if (desvio < 25) {
    problemas.push({ nivel: "grave", titulo: "Pouco contraste", dica: "Coloque o papel sobre uma superfície escura e lisa e confira se o texto aparece." });
  }
  if (nitidez < 40) {
    problemas.push({ nivel: "grave", titulo: "Foto tremida ou desfocada", dica: "Apoie os cotovelos, toque na tela sobre o documento para focar e espere um segundo antes de fotografar." });
  } else if (nitidez < 100) {
    problemas.push({ nivel: "atencao", titulo: "Nitidez abaixo do ideal", dica: "Segure firme e toque na tela para focar antes de fotografar." });
  }

  const graves = problemas.filter((p) => p.nivel === "grave").length;
  const nota = graves > 0 ? "ruim" : problemas.length > 0 ? "aceitavel" : "boa";
  return { nota, problemas, largura, altura };
}
