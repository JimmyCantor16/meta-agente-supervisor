import { useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";

const SEGUNDOS = 60;
const LS_CAPSULA = "sala.capsula";
const CIRCUNFERENCIA = 97.4; // 2π·15.5, el aro del temporizador

function leerIndice(total: number): number {
  try {
    const n = Number(window.localStorage.getItem(LS_CAPSULA));
    return Number.isFinite(n) && n >= 0 ? n % total : 0;
  } catch {
    return 0;
  }
}

/**
 * Cápsula de 60 segundos: una pregunta con tres opciones sobre la misma
 * tecnología que el usuario está usando (HLS, CORS, contenido mixto…).
 *
 * Cada vez que se abre muestra la SIGUIENTE (el índice se recuerda en el
 * navegador): así la tecla verde siempre trae algo nuevo que aprender.
 */
export function Capsula({ onCerrar }: { onCerrar: () => void }) {
  const { t } = useLanguage();
  const lista = t.sala.capsulas;
  const [i, setI] = useState(() => leerIndice(lista.length));
  const [elegida, setElegida] = useState<number | null>(null); // -1 = se acabó el tiempo
  const [quedan, setQuedan] = useState(SEGUNDOS);
  const reloj = useRef<number | null>(null);
  const c = lista[i % lista.length];

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_CAPSULA, String((i + 1) % lista.length));
    } catch {
      /* navegación privada: no pasa nada */
    }
    setElegida(null);
    setQuedan(SEGUNDOS);
    reloj.current = window.setInterval(() => setQuedan((q) => q - 1), 1000);
    return () => {
      if (reloj.current) window.clearInterval(reloj.current);
    };
  }, [i, lista.length]);

  useEffect(() => {
    if (quedan <= 0 && elegida === null) setElegida(-1);
  }, [quedan, elegida]);

  useEffect(() => {
    if (elegida !== null && reloj.current) window.clearInterval(reloj.current);
  }, [elegida]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const respondida = elegida !== null;
  const prefijo =
    elegida === c.a ? t.sala.capsRight : elegida === -1 ? t.sala.capsTimeout : t.sala.capsWrong("ABC"[c.a]);

  return (
    <div className="sala-caps" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="sala-caps-card">
        <div className="sala-caps-top">
          <span className="sala-caps-tag">
            <Lightbulb size={14} />
            {t.sala.capsTag}
          </span>
          <span className="sala-caps-timer" aria-hidden>
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#30A46C"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRCUNFERENCIA}
                strokeDashoffset={CIRCUNFERENCIA * (1 - Math.max(quedan, 0) / SEGUNDOS)}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <b>{Math.max(quedan, 0)}</b>
          </span>
        </div>
        <p className="sala-caps-q">{c.q}</p>
        <div className="sala-caps-opts">
          {c.o.map((texto, k) =>
            // Respondida, solo queda la correcta: la explicación necesita el sitio.
            respondida && k !== c.a ? null : (
              <button
                key={k}
                type="button"
                className={`sala-opt${respondida && k === c.a ? " ok" : ""}`}
                onClick={() => setElegida(k)}
                disabled={respondida}
              >
                <span className="l">{"ABC"[k]}</span>
                <span>{texto}</span>
              </button>
            ),
          )}
        </div>
        {respondida && <p className="sala-caps-e">{prefijo + c.e}</p>}
        <div className="sala-caps-foot">
          <span>
            {(i % lista.length) + 1} / {lista.length}
          </span>
          <button type="button" onClick={() => setI((x) => (x + 1) % lista.length)}>
            {t.sala.capsNext}
          </button>
        </div>
      </div>
    </div>
  );
}
