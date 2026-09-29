// Colores de "contenido" de La Sala: el cartel de cada canal, el disco de cada
// emisora y el brillo de la radio en pantalla. No son colores de interfaz (esos
// salen de tailwind.config.js): hacen el papel de la imagen que un canal real
// traería, y por eso hay muchos. Cada canal recibe siempre la misma paleta
// (se deriva de su nombre), así su cartel es reconocible de un día a otro.

/** [color principal, color secundario, fondo]. */
export type Paleta = readonly [string, string, string];

const PALETAS: Paleta[] = [
  ["#ff7a45", "#ffc15e", "#1b2238"],
  ["#e63973", "#ff9eb5", "#231a33"],
  ["#f4a261", "#e76f51", "#12303a"],
  ["#9d4edd", "#e0aaff", "#12002b"],
  ["#e9c46a", "#2a9d8f", "#16213a"],
  ["#d4a373", "#faedcd", "#2b2016"],
  ["#ff3d8b", "#ffbe0b", "#2a0a5e"],
  ["#f72585", "#b5179e", "#2d0a4e"],
  ["#ffd60a", "#ff8500", "#3a0710"],
  ["#dda15e", "#bc6c25", "#1f2a14"],
  ["#4cc9f0", "#80ffdb", "#10214a"],
  ["#06d6a0", "#ffd166", "#0b3a4a"],
  ["#ff4d6d", "#ffb3c1", "#1a0536"],
  ["#00f5d4", "#9b5de5", "#0b132b"],
  ["#48cae4", "#caf0f8", "#061a40"],
  ["#5a7dff", "#e8f0ff", "#0d1b3d"],
];

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function paletaDe(nombre: string): Paleta {
  return PALETAS[hash(nombre) % PALETAS.length];
}

/** El "cartel" de un canal: su paleta como luz de escena. */
export function fondoCartel(p: Paleta): string {
  return `radial-gradient(90% 100% at 18% 8%, ${p[0]}dd, transparent 62%), radial-gradient(80% 90% at 92% 100%, ${p[1]}bb, transparent 60%), ${p[2]}`;
}
