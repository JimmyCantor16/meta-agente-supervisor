import { useRef } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Cast, ChevronDown, ChevronUp, Minus, Plus, Power, Shuffle, Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { EstadoCast } from "../../multimedia";

/** Las cuatro teclas de color: cada una es un pilar de La Sala. */
export type TeclaColor = "tv" | "caps" | "ttx" | "radio";

interface Props {
  activa: TeclaColor | null;
  mudo: boolean;
  /** Google Cast: la tecla no se dibuja cuando el navegador no sabe de teles. */
  cast: EstadoCast;
  onCast: () => void;
  onPower: () => void;
  onMute: () => void;
  onCanal: (paso: 1 | -1) => void;
  onVolumen: (paso: 1 | -1) => void;
  onDigito: (d: string) => void;
  onTecla: (k: TeclaColor) => void;
  onZap: () => void;
}

const COLOR: Record<TeclaColor, string> = {
  tv: "var(--tecla-red)",
  caps: "var(--tecla-green)",
  ttx: "var(--tecla-yellow)",
  radio: "var(--tecla-blue)",
};

/**
 * El control remoto: la navegación de La Sala. Tiene lo que tendría uno de
 * verdad —CH, VOL, teclado numérico, las teclas de color del teletexto— y el
 * gran botón de ZAPPING, que es el único en verde de marca: la acción principal.
 */
export function ControlRemoto(p: Props) {
  const { t } = useLanguage();
  const ir = useRef<HTMLDivElement | null>(null);

  // El LED infrarrojo parpadea con cada tecla, como en un mando real.
  const emitir = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest("button")) return;
    const led = ir.current;
    if (!led) return;
    led.classList.add("blink");
    window.setTimeout(() => led.classList.remove("blink"), 140);
  };

  const castTitulo =
    p.cast === "conectado" ? t.sala.castStop : p.cast === "sin-dispositivos" ? t.sala.castNoDevices : t.sala.cast;

  const teclas: { k: TeclaColor; label: string }[] = [
    { k: "tv", label: t.sala.keyLive },
    { k: "caps", label: t.sala.keyLearn },
    { k: "ttx", label: t.sala.keyText },
    { k: "radio", label: t.sala.keyRadio },
  ];

  return (
    <div
      className="sala-remote"
      role="group"
      aria-label={t.sala.remote}
      onClickCapture={emitir}
    >
      <div ref={ir} className="sala-ir" />
      <div className="sala-r-row">
        <button type="button" className="sala-rk pwr" onClick={p.onPower} aria-label={t.sala.power} title={t.sala.power}>
          <Power size={18} />
        </button>
        {p.cast !== "no-disponible" && (
          <button
            type="button"
            className={`sala-rk cast ${p.cast}`}
            onClick={p.onCast}
            aria-label={castTitulo}
            title={castTitulo}
            aria-pressed={p.cast === "conectado"}
          >
            <Cast size={18} />
          </button>
        )}
        <button type="button" className="sala-rk mute" onClick={p.onMute} aria-label={t.sala.mute} title={t.sala.mute}>
          {p.mudo ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      <div className="sala-rockers">
        <div className="sala-rocker">
          <button type="button" onClick={() => p.onCanal(1)} aria-label={t.sala.chUp} title={t.sala.chUp}>
            <ChevronUp size={18} />
          </button>
          <span>CH</span>
          <button type="button" onClick={() => p.onCanal(-1)} aria-label={t.sala.chDown} title={t.sala.chDown}>
            <ChevronDown size={18} />
          </button>
        </div>
        <div className="sala-rocker">
          <button type="button" onClick={() => p.onVolumen(1)} aria-label={t.sala.volUp} title={t.sala.volUp}>
            <Plus size={18} />
          </button>
          <span>VOL</span>
          <button type="button" onClick={() => p.onVolumen(-1)} aria-label={t.sala.volDown} title={t.sala.volDown}>
            <Minus size={18} />
          </button>
        </div>
      </div>

      <div className="sala-numpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
          <button
            key={d}
            type="button"
            className={`sala-rk${d === "0" ? " z" : ""}`}
            onClick={() => p.onDigito(d)}
            aria-label={t.sala.key(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="sala-ckeys">
        {teclas.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            className={`sala-ck${p.activa === k ? " on" : ""}`}
            style={{ "--c": COLOR[k] } as CSSProperties}
            onClick={() => p.onTecla(k)}
            aria-pressed={p.activa === k}
          >
            <i />
            {label}
          </button>
        ))}
      </div>

      <button type="button" className="sala-zap" onClick={p.onZap}>
        <Shuffle size={22} />
        {t.sala.zap}
      </button>
      <div className="sala-r-brand" aria-hidden>
        JAMZ
      </div>
    </div>
  );
}
