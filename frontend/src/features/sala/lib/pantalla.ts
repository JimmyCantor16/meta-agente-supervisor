// Lo que la tele de La Sala dibuja ELLA MISMA en su canvas, cuando no hay vídeo
// que mostrar: la carta de ajuste (nada sonando), la estática (cambiando de
// canal o sin señal) y el ecualizador de la radio.
//
// El ecualizador es DECORATIVO a propósito: medir el audio real exigiría pasar
// la emisora por Web Audio, y con una emisora sin CORS eso no solo devuelve
// ceros — silencia el sonido. Una radio muda por un adorno sería absurdo.

export const PANTALLA_W = 480;
export const PANTALLA_H = 270;

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function redondeado(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Barras de la carta de ajuste (el patrón SMPTE de toda la vida).
const BARRAS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
const CONTRA = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];

/** Carta de ajuste con la hora: la tele encendida esperando que elijas algo. */
export function dibujarCarta(g: CanvasRenderingContext2D, titulo: string, sub: string, hora: string) {
  const W = PANTALLA_W;
  const H = PANTALLA_H;
  const bw = W / BARRAS.length;
  BARRAS.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(i * bw, 0, bw + 1, H * 0.66);
  });
  CONTRA.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(i * bw, H * 0.66, bw + 1, H * 0.08);
  });
  const base = ["#00214c", "#ffffff", "#32006a", "#131313", "#090909", "#131313", "#1d1d1d", "#131313"];
  const cw = W / base.length;
  base.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(i * cw, H * 0.74, cw + 1, H * 0.26);
  });

  // Recuadro central con la marca, el aviso y la hora.
  const bx = W * 0.14;
  const by = H * 0.24;
  const bwid = W * 0.72;
  const bh = H * 0.5;
  g.fillStyle = "rgba(9,11,21,.9)";
  redondeado(g, bx, by, bwid, bh, 10);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,.25)";
  g.lineWidth = 2;
  g.stroke();
  g.textAlign = "center";
  g.fillStyle = "#ffffff";
  g.font = "26px Righteous, 'Trebuchet MS', sans-serif";
  g.fillText("Jamz · Free TV", W / 2, by + 38);
  g.fillStyle = "#00E0AC";
  g.font = "34px VT323, monospace";
  g.fillText(hora, W / 2, by + 74);
  g.fillStyle = "rgba(255,255,255,.85)";
  g.font = "19px VT323, monospace";
  g.fillText(titulo.toUpperCase(), W / 2, by + 100, bwid - 24);
  g.fillStyle = "rgba(255,255,255,.5)";
  g.font = "15px VT323, monospace";
  g.fillText(sub, W / 2, by + 120, bwid - 24);
  g.textAlign = "left";
}

/** Nieve de antena. `ruido` es un canvas pequeño que se reutiliza (160×90). */
export function dibujarEstatica(g: CanvasRenderingContext2D, ruido: HTMLCanvasElement) {
  const r = ruido.getContext("2d");
  if (!r) return;
  const img = r.createImageData(ruido.width, ruido.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  r.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(ruido, 0, 0, PANTALLA_W, PANTALLA_H);
  g.imageSmoothingEnabled = true;
  const y = (performance.now() / 3) % PANTALLA_H;
  g.fillStyle = "rgba(255,255,255,.12)";
  g.fillRect(0, y, PANTALLA_W, 24);
}

/** Pantalla de la radio: nombre de la emisora y un ecualizador que respira. */
export function dibujarRadio(
  g: CanvasRenderingContext2D,
  t: number,
  nombre: string,
  sub: string,
  etiqueta: string,
  color: string,
  nivel: number,
) {
  const W = PANTALLA_W;
  const H = PANTALLA_H;
  g.fillStyle = "#070B1F";
  g.fillRect(0, 0, W, H);
  const brillo = g.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, 260);
  brillo.addColorStop(0, rgba(color, 0.3));
  brillo.addColorStop(1, rgba(color, 0));
  g.fillStyle = brillo;
  g.fillRect(0, 0, W, H);

  const n = 40;
  const bw = W / n;
  const suelo = H - 40;
  for (let i = 0; i < n; i++) {
    const v = (Math.sin(t / 170 + i * 0.55) + Math.sin(t / 95 + i * 1.9) + Math.sin(t / 260 + i * 0.2) + 3) / 6;
    const h = 6 + v * v * 130 * nivel;
    g.fillStyle = rgba(color, 0.35 + v * 0.55);
    g.fillRect(i * bw + 2, suelo - h, bw - 4, h);
    g.fillStyle = rgba(color, 0.12);
    g.fillRect(i * bw + 2, suelo + 5, bw - 4, h * 0.22);
  }

  g.textAlign = "center";
  g.fillStyle = "#ffffff";
  g.font = "50px VT323, monospace";
  g.fillText(nombre.toUpperCase(), W / 2, 80, W - 40);
  g.fillStyle = "rgba(255,255,255,.62)";
  g.font = "21px VT323, monospace";
  g.fillText(`${sub.toUpperCase()}  ·  ${etiqueta}`, W / 2, 106, W - 40);
  g.textAlign = "left";
}
