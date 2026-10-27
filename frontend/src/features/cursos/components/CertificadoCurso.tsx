import { Award } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { CertificadoCatalogo } from "../types";

/** El certificado ganado: lo emite el servidor la primera vez que el curso queda completo. */
export function CertificadoCurso({ certificado }: { certificado: CertificadoCatalogo }) {
  const { t, lang } = useLanguage();
  const g = t.cursos;
  const fecha = new Date(certificado.emitido).toLocaleDateString(lang === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="mb-8 rounded-lg border border-brand-200 bg-white p-6 text-center shadow-float">
      <Award size={32} className="mx-auto text-brand-600" aria-hidden />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-brand-600">{g.certTitle}</p>
      {certificado.nombre && <p className="mt-3 text-heading text-ink">{certificado.nombre}</p>}
      <p className="mt-2 text-sm text-ink-body">{g.certBody}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{certificado.titulo_curso}</p>
      <p className="mt-4 text-xs text-ink-muted">
        {fecha} · {g.certFolio} <span className="font-mono">{certificado.folio}</span>
      </p>
    </section>
  );
}
