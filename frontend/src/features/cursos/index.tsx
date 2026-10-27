import { useState } from "react";
import { CatalogoCursos } from "./components/CatalogoCursos";
import { ReproductorCurso } from "./components/ReproductorCurso";

/**
 * Módulo «Academia»: catálogo de cursos escritos y su reproductor.
 *
 * Es aparte del Modo Profesor (que genera un curso a medida de un proyecto):
 * aquí el curso ya está escrito y la IA hace de tutor. Ocupa el ancho entero
 * de la zona de trabajo porque el reproductor necesita temario + lectura.
 */
export default function VistaCursos() {
  const [abierto, setAbierto] = useState<string | null>(null);

  if (abierto) {
    return <ReproductorCurso cursoId={abierto} onVolver={() => setAbierto(null)} />;
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <CatalogoCursos onAbrir={setAbierto} />
    </div>
  );
}
