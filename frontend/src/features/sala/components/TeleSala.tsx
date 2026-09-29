import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useMultimedia } from "../../multimedia";
import { horaCorta } from "../hooks/useReloj";
import { PANTALLA_H, PANTALLA_W, dibujarCarta, dibujarEstatica, dibujarRadio } from "../lib/pantalla";

export type ModoPantalla = "tv" | "radio" | "youtube" | "idle";

export interface TeleSalaProps {
  encendida: boolean;
  /** Animación de encendido/apagado en curso (la rayita del tubo). */
  transicion: "on" | "off" | null;
  modo: ModoPantalla;
  /** Cambia en cada cambio de canal: dispara la nieve y el meneo de antenas. */
  cambio: number;
  osd: { texto: string; id: number } | null;
  /** Rótulo fijo en pantalla (p. ej. SIN SEÑAL): no se desvanece. */
  osdFijo: string | null;
  rotulo: { num: string; nombre: string; sub: string; id: number } | null;
  volumen: { nivel: number; mudo: boolean; id: number } | null;
  radio: { nombre: string; sub: string; color: string } | null;
  ytId: string | null;
  /** Aviso a pantalla completa (la tele se está viendo en la mini tele / ventana). */
  aviso: ReactNode;
  /** Teletexto o cápsula, dibujados DENTRO de la pantalla. */
  capa: ReactNode;
  giroCanal: number;
  giroVolumen: number;
  onPerillaCanal: () => void;
  onPerillaVolumen: () => void;
  onDobleClic: () => void;
  pantallaRef: (el: HTMLDivElement | null) => void;
}

const reducirMovimiento =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * La tele grande de La Sala: el mismo aparato "estilo Simpsons" de la mini tele
 * flotante y de la ventana PiP, en grande y con su mueble.
 *
 * El <video> NO es de este componente: es el nodo único del MultimediaProvider,
 * que lo muda dentro de `.sala-host` (vía `registerStage`) mientras La Sala
 * esté montada. Así el canal sigue sonando sin cortes al entrar o salir.
 *
 * La "luz ambiente" (el resplandor de color detrás de la tele) copia la imagen
 * a un canvas diminuto con `drawImage`, sin leer nunca sus píxeles: por eso
 * funciona también con canales y miniaturas de otros dominios (un canvas
 * "contaminado" se puede mostrar; lo que CORS impide es leerlo).
 */
export function TeleSala(p: TeleSalaProps) {
  const { t } = useLanguage();
  const m = useMultimedia();

  const vizRef = useRef<HTMLCanvasElement | null>(null);
  const ambiRef = useRef<HTMLCanvasElement | null>(null);
  const tvRef = useRef<HTMLDivElement | null>(null);
  const ruido = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    return c;
  }, []);
  const ytImg = useMemo(() => new Image(), []);
  const nieveHasta = useRef(0);

  // Nieve breve y meneo de antenas en cada cambio de canal.
  useEffect(() => {
    if (p.cambio === 0) return;
    nieveHasta.current = performance.now() + (reducirMovimiento ? 0 : 380);
    const tv = tvRef.current;
    if (!tv) return;
    tv.classList.remove("bump");
    void tv.offsetWidth;
    tv.classList.add("bump");
  }, [p.cambio]);

  useEffect(() => {
    if (p.ytId) ytImg.src = `https://i.ytimg.com/vi/${p.ytId}/mqdefault.jpg`;
  }, [p.ytId, ytImg]);

  // Estado vivo para el bucle de dibujo (sin reiniciarlo en cada render).
  const vivo = useRef({
    encendida: p.encendida,
    modo: p.modo,
    radio: p.radio,
    cargando: false,
    nivel: 0.8,
    titulo: "",
    sub: "",
    etiquetaRadio: "",
  });
  vivo.current = {
    encendida: p.encendida,
    modo: p.modo,
    radio: p.radio,
    // Mientras el canal arranca (o no hay señal) se ve nieve, como una tele de verdad.
    cargando: p.modo === "tv" && ((m.buffering && !m.playing) || !!p.osdFijo),
    nivel: m.volume / 100,
    titulo: t.sala.idleTitle,
    sub: t.sala.idleSub,
    etiquetaRadio: t.sala.radioBadge,
  };

  useEffect(() => {
    const viz = vizRef.current;
    const ambi = ambiRef.current;
    const g = viz?.getContext("2d");
    const a = ambi?.getContext("2d");
    if (!viz || !ambi || !g || !a) return;
    let raf = 0;
    let cuadro = 0;
    let vizVisible = true;
    let cartaMinuto = "";

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const s = vivo.current;
      cuadro++;
      if (!s.encendida) return;

      const nieve = ts < nieveHasta.current || s.cargando;
      let fuente: CanvasImageSource | null = null;
      let mostrarViz = false;

      if (nieve) {
        dibujarEstatica(g, ruido);
        cartaMinuto = "";
        fuente = viz;
        mostrarViz = true;
      } else if (s.modo === "radio" && s.radio) {
        const tiempo = reducirMovimiento ? ts * 0.2 : ts;
        dibujarRadio(g, tiempo, s.radio.nombre, s.radio.sub, s.etiquetaRadio, s.radio.color, s.nivel);
        fuente = viz;
        mostrarViz = true;
      } else if (s.modo === "idle") {
        // La carta solo cambia con el minuto: se repinta entonces, no a 60 fps.
        const hora = horaCorta(new Date());
        if (hora !== cartaMinuto) {
          dibujarCarta(g, s.titulo, s.sub, hora);
          cartaMinuto = hora;
        }
        fuente = viz;
        mostrarViz = true;
      } else if (s.modo === "tv") {
        const v = m.getVideo();
        if (v && v.readyState >= 2) fuente = v;
      } else if (s.modo === "youtube" && ytImg.complete && ytImg.naturalWidth > 0) {
        fuente = ytImg;
      }
      if (s.modo !== "idle") cartaMinuto = "";

      if (mostrarViz !== vizVisible) {
        viz.style.opacity = mostrarViz ? "1" : "0";
        vizVisible = mostrarViz;
      }
      // La luz ambiente no necesita 60 fps: uno de cada tres cuadros basta.
      if (fuente && cuadro % 3 === 0) {
        try {
          a.drawImage(fuente, 0, 0, ambi.width, ambi.height);
        } catch {
          /* vídeo sin fotograma todavía */
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [m.getVideo, ruido, ytImg]);

  const clases = ["sala-tv"];
  if (!p.encendida && p.transicion !== "off") clases.push("off");
  if (p.transicion === "off") clases.push("going-off");
  if (p.transicion === "on") clases.push("going-on");

  return (
    <div ref={tvRef} className={clases.join(" ")}>
      <canvas ref={ambiRef} className="sala-ambi" width={64} height={36} aria-hidden />

      <svg className="sala-ant" viewBox="0 0 240 90" aria-hidden>
        <line x1="120" y1="90" x2="22" y2="10" stroke="#20233B" strokeWidth="7" strokeLinecap="round" />
        <line x1="120" y1="90" x2="218" y2="10" stroke="#20233B" strokeWidth="7" strokeLinecap="round" />
        <circle cx="22" cy="10" r="9" fill="#20233B" />
        <circle cx="218" cy="10" r="9" fill="#20233B" />
      </svg>
      <div className="sala-dvd" aria-hidden>
        <span className="slot" />
        <span className="dled" />
      </div>
      <svg className="sala-cable" viewBox="0 0 74 150" aria-hidden>
        <path d="M2 8 C 50 8, 56 70, 40 128" fill="none" stroke="#E8503A" strokeWidth="6" strokeLinecap="round" />
        <rect x="28" y="124" width="24" height="17" rx="3" fill="#F6B73C" stroke="#20233B" strokeWidth="3.5" />
      </svg>

      <div className="sala-tv-body">
        <div className="sala-bezel">
          <div className="sala-screen" ref={p.pantallaRef} onDoubleClick={p.onDobleClic}>
            {/* Aquí el Provider muda el <video> real. */}
            <div ref={m.registerStage} className="sala-host" />
            <canvas ref={vizRef} className="sala-viz" width={PANTALLA_W} height={PANTALLA_H} aria-hidden />

            {p.encendida && p.rotulo && (
              <div key={p.rotulo.id} className="sala-lower">
                <span className="ln">{p.rotulo.num}</span>
                <span className="lt">
                  <b>{p.rotulo.nombre}</b>
                  <small>{p.rotulo.sub}</small>
                </span>
              </div>
            )}
            {p.encendida && p.osdFijo && <div className="sala-osd fijo">{p.osdFijo}</div>}
            {p.encendida && !p.osdFijo && p.osd && (
              <div key={p.osd.id} className="sala-osd">
                {p.osd.texto}
              </div>
            )}
            {p.encendida && p.volumen && (
              <div key={p.volumen.id} className="sala-volosd">
                {p.volumen.mudo ? t.sala.osdMute : t.sala.osdVol}
                <span className="bars">
                  {Array.from({ length: 20 }, (_, i) => (
                    <i key={i} className={!p.volumen?.mudo && i < p.volumen!.nivel ? "on" : ""} />
                  ))}
                </span>
              </div>
            )}

            {p.encendida && p.aviso}
            {p.encendida && p.capa}

            <div className="sala-scan" />
            <div className="sala-vig" />
            <div className="sala-glass" />
            <div className="sala-offmsg">{t.sala.offHint}</div>
            <div className="sala-pw" />
          </div>
        </div>

        <div className="sala-ctrl">
          <button
            type="button"
            className="sala-knob"
            aria-label={t.sala.chUp}
            title={t.sala.chUp}
            onClick={p.onPerillaCanal}
            style={{ transform: `rotate(${p.giroCanal}deg)` }}
          />
          <button
            type="button"
            className="sala-knob"
            aria-label={t.sala.volUp}
            title={t.sala.volUp}
            onClick={p.onPerillaVolumen}
            style={{ transform: `rotate(${p.giroVolumen}deg)` }}
          />
          <span className="sala-led" />
          <span className="sala-grille" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="sala-tv-brand">
          Jamz Software · <span>Free TV</span>
        </div>
        <div className="sala-feet" aria-hidden>
          <span>
            <i />
            <i />
          </span>
          <span>
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

/** El mueble bajo la tele, con su planta y sus libros (aprender, en la sala). */
export function MuebleSala() {
  return (
    <div className="sala-board" aria-hidden>
      <svg className="sala-plant" viewBox="0 0 74 96">
        <path d="M37 60 C 20 48, 8 30, 14 12 C 28 22, 36 40, 37 60Z" fill="#30A46C" stroke="#20233B" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M37 60 C 50 44, 64 34, 66 16 C 50 22, 40 38, 37 60Z" fill="#3FBF7F" stroke="#20233B" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M37 62 C 34 44, 38 26, 44 6 C 50 26, 44 46, 37 62Z" fill="#46C98A" stroke="#20233B" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M16 58 H58 L52 94 H22 Z" fill="#D9653B" stroke="#20233B" strokeWidth="3.5" strokeLinejoin="round" />
        <rect x="12" y="56" width="50" height="10" rx="3" fill="#E8784D" stroke="#20233B" strokeWidth="3.5" />
      </svg>
      <svg className="sala-books" viewBox="0 0 96 56">
        <rect x="6" y="38" width="84" height="15" rx="3" fill="#3E63DD" stroke="#20233B" strokeWidth="3.5" />
        <rect x="12" y="22" width="72" height="16" rx="3" fill="#F5D90A" stroke="#20233B" strokeWidth="3.5" />
        <rect x="2" y="6" width="78" height="16" rx="3" fill="#E5484D" stroke="#20233B" strokeWidth="3.5" />
        <line x1="16" y1="14" x2="40" y2="14" stroke="#20233B" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="dr" />
      <span className="dr" />
      <span className="dr" />
    </div>
  );
}
