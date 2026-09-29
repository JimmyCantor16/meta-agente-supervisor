import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { abrirExterno } from "../../../lib/abrirExterno";
import { useTitulares } from "../hooks/useTitulares";
import { dosCifras, useReloj } from "../hooks/useReloj";
import { FUENTES_TTX, PAGINA_CAPSULAS, PAGINA_INDICE, PAGINA_PROGRAMACION } from "../lib/fuentes";

const POR_SUBPAGINA = 6;
const ROTAR_MS = 15_000;

interface Props {
  pagina: number;
  /** Lo que el usuario va tecleando en el control ("1", "11"…), o "". */
  entrada: string;
  onPagina: (n: number) => void;
  onCerrar: () => void;
}

/**
 * Teletexto Jamz: titulares REALES en páginas numeradas, como el de siempre.
 * Índice en la 100, noticias en las 101-150, cápsulas en la 500 y la
 * programación en la 600. Como en los de verdad, las subpáginas rotan solas
 * (se detienen con el ratón encima) y cada titular abre la noticia completa
 * en el navegador del usuario.
 */
export function Teletexto({ pagina, entrada, onPagina, onCerrar }: Props) {
  const { t, lang } = useLanguage();
  const g = t.sala;
  const ahora = useReloj(1000);
  const fuente = FUENTES_TTX.find((f) => f.pagina === pagina) ?? null;
  const { items, cargando, error } = useTitulares(fuente?.url ?? null);

  const [sub, setSub] = useState(0);
  const [quieto, setQuieto] = useState(false);
  const subpaginas = Math.max(1, Math.ceil(items.length / POR_SUBPAGINA));

  useEffect(() => setSub(0), [pagina]);
  useEffect(() => {
    if (!fuente || quieto || subpaginas < 2) return;
    const id = window.setInterval(() => setSub((s) => (s + 1) % subpaginas), ROTAR_MS);
    return () => window.clearInterval(id);
  }, [fuente, quieto, subpaginas]);

  const dia = ahora.toLocaleDateString(lang === "es" ? "es-CO" : "en-GB", { weekday: "short" }).replace(".", "");
  const mes = ahora.toLocaleDateString(lang === "es" ? "es-CO" : "en-GB", { month: "short" }).replace(".", "");
  const reloj = `${dia} ${ahora.getDate()} ${mes} ${dosCifras(ahora.getHours())}:${dosCifras(ahora.getMinutes())}:${dosCifras(ahora.getSeconds())}`;
  const cabecera = entrada ? `P${entrada.padEnd(3, "-")}` : `P${pagina}`;

  const titulo = fuente ? g.ttxSections[fuente.seccion] : g.ttxIndex;
  const visibles = items.slice(sub * POR_SUBPAGINA, (sub + 1) * POR_SUBPAGINA);

  return (
    <div
      className="sala-ttx"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setQuieto(true)}
      onMouseLeave={() => setQuieto(false)}
    >
      <div className="sala-ttx-top">
        <span>{cabecera}</span>
        <span className="y">JAMZ TEXTO</span>
        <span className="c">{reloj}</span>
      </div>
      <div className="sala-ttx-title">
        <b>JAMZ</b>
        <b>TEXTO</b>
        <span>
          {titulo.toUpperCase()}
          {fuente && subpaginas > 1 ? ` ${sub + 1}/${subpaginas}` : ""}
        </span>
      </div>

      {!fuente ? (
        <ul>
          {FUENTES_TTX.map((f) => (
            <li key={f.pagina}>
              <button type="button" onClick={() => onPagina(f.pagina)}>
                <span className="tx">{g.ttxSections[f.seccion]}</span>
                <span className="dots" />
                <span className="pg">{f.pagina}</span>
              </button>
            </li>
          ))}
          <li className="g">
            <button type="button" onClick={() => onPagina(PAGINA_CAPSULAS)}>
              <span className="tx">{g.ttxSections.capsulas}</span>
              <span className="dots" />
              <span className="pg">{PAGINA_CAPSULAS}</span>
            </button>
          </li>
          <li className="c">
            <button type="button" onClick={() => onPagina(PAGINA_PROGRAMACION)}>
              <span className="tx">{g.ttxSections.programacion}</span>
              <span className="dots" />
              <span className="pg">{PAGINA_PROGRAMACION}</span>
            </button>
          </li>
        </ul>
      ) : cargando ? (
        <ul>
          <li>{g.ttxLoading}</li>
        </ul>
      ) : error ? (
        <ul>
          <li style={{ color: "#FF5555" }}>{g.ttxError}</li>
        </ul>
      ) : (
        <ul>
          {visibles.map((it) => (
            <li key={it.url}>
              <button type="button" onClick={() => abrirExterno(it.url)} title={g.ttxOpenNews}>
                <span className="bullet">▸</span>
                <span className="tx">{it.titulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="sala-ttx-note">
        <span>{fuente ? g.ttxSource(fuente.medio) : g.ttxHint}</span>
      </p>
      <div className="sala-ttx-fast">
        <button type="button" className="f-r" onClick={() => onPagina(PAGINA_INDICE)}>
          {g.ttxFastIndex}
        </button>
        <button type="button" className="f-g" onClick={() => setSub((s) => (s - 1 + subpaginas) % subpaginas)} disabled={!fuente}>
          {g.ttxFastPrev}
        </button>
        <button type="button" className="f-y" onClick={() => setSub((s) => (s + 1) % subpaginas)} disabled={!fuente}>
          {g.ttxFastNext}
        </button>
        <button type="button" className="f-b" onClick={onCerrar}>
          {g.ttxFastExit}
        </button>
      </div>
    </div>
  );
}
