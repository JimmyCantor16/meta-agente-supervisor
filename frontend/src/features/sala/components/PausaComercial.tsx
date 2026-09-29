import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";

/**
 * «Pausa comercial»: el puente del sofá al taller. Es lo que convierte La Sala
 * en la puerta del producto y no en un rincón aparte: una idea de las que
 * nacen viendo la tele, y un botón que la deja escrita en el Taller.
 */
export function PausaComercial({ onLlevar }: { onLlevar: (idea: string) => void }) {
  const { t } = useLanguage();
  const g = t.sala;
  const [elegida, setElegida] = useState(0);
  const idea = g.seeds[elegida] ?? g.seeds[0];
  const [escrito, setEscrito] = useState("");

  // La vista previa "teclea" la idea, como si ya estuviera en el Taller.
  useEffect(() => {
    setEscrito("");
    let k = 0;
    const id = window.setInterval(() => {
      k++;
      setEscrito(idea.slice(0, k));
      if (k >= idea.length) window.clearInterval(id);
    }, 38);
    return () => window.clearInterval(id);
  }, [idea]);

  return (
    <section className="sala-break">
      <span className="tag">{g.breakTag}</span>
      <div>
        <div className="sala-eyebrow">{g.breakEyebrow}</div>
        <h2>{g.breakTitle}</h2>
        <p>{g.breakBody}</p>
        <div className="sala-seeds">
          {g.seeds.map((s, i) => (
            <button
              key={s}
              type="button"
              className={`sala-seed${i === elegida ? " on" : ""}`}
              onClick={() => setElegida(i)}
              aria-pressed={i === elegida}
            >
              {s}
            </button>
          ))}
        </div>
        <button type="button" className="sala-btn primary" onClick={() => onLlevar(idea)}>
          {g.breakCta}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="sala-preview" aria-hidden>
        <div className="ph">
          <i />
          {g.previewLabel}
        </div>
        <div className="box">
          <div className="typed">
            {escrito}
            <span className="caret" />
          </div>
          <div className="pf">
            <span>{g.previewNote}</span>
            <span className="go">
              {g.previewGo}
              <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
