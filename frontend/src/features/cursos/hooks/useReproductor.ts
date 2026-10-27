import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  ApiError,
  completarLeccionCatalogo,
  evaluarCatalogo,
  obtenerCursoCatalogo,
  revisarRetoCatalogo,
} from "../../../lib/api";
import type {
  CursoCatalogo,
  Evaluacion,
  Leccion,
  ModuloCurso,
  ProgresoCatalogo,
  ResultadoEvaluacion,
  Seleccion,
  VeredictoReto,
} from "../types";

/**
 * Estado del reproductor de un curso: el «store» de la feature.
 *
 * Es el papel que en Vue haría un store de Pinia: un estado tipado, acciones
 * que hablan con la API y valores derivados. Aquí es un reducer (cada cambio
 * es una acción con nombre, fácil de seguir) y el hook expone las acciones.
 * El progreso que vuelve del servidor REEMPLAZA al local: la verdad de qué
 * está aprobado vive allí, nunca en el navegador.
 */
interface Estado {
  curso: CursoCatalogo | null;
  progreso: ProgresoCatalogo | null;
  seleccion: Seleccion | null;
  cargando: boolean;
  error: string | null;
  /** Último resultado de cada quiz en esta sesión (para pintar aciertos). */
  resultados: Record<string, ResultadoEvaluacion>;
  /** Último veredicto de cada reto en esta sesión. */
  veredictos: Record<string, VeredictoReto>;
  /** Qué está en vuelo: "completar", el id de una evaluación o de un reto. */
  enviando: string | null;
}

type Accion =
  | { tipo: "cargando" }
  | { tipo: "cargado"; curso: CursoCatalogo; progreso: ProgresoCatalogo | null }
  | { tipo: "error"; mensaje: string }
  | { tipo: "seleccionar"; seleccion: Seleccion }
  | { tipo: "enviando"; que: string | null }
  | { tipo: "progreso"; progreso: ProgresoCatalogo }
  | { tipo: "resultado"; resultado: ResultadoEvaluacion; progreso: ProgresoCatalogo }
  | { tipo: "veredicto"; retoId: string; veredicto: VeredictoReto; progreso: ProgresoCatalogo };

const INICIAL: Estado = {
  curso: null,
  progreso: null,
  seleccion: null,
  cargando: true,
  error: null,
  resultados: {},
  veredictos: {},
  enviando: null,
};

function reducir(estado: Estado, accion: Accion): Estado {
  switch (accion.tipo) {
    case "cargando":
      return { ...estado, cargando: true, error: null };
    case "cargado":
      return {
        ...estado,
        cargando: false,
        curso: accion.curso,
        progreso: accion.progreso,
        seleccion: estado.seleccion ?? primeraPendiente(accion.curso, accion.progreso),
      };
    case "error":
      return { ...estado, cargando: false, enviando: null, error: accion.mensaje };
    case "seleccionar":
      return { ...estado, seleccion: accion.seleccion, error: null };
    case "enviando":
      return { ...estado, enviando: accion.que, error: accion.que ? null : estado.error };
    case "progreso":
      return { ...estado, enviando: null, progreso: accion.progreso };
    case "resultado":
      return {
        ...estado,
        enviando: null,
        progreso: accion.progreso,
        resultados: { ...estado.resultados, [accion.resultado.evaluacion_id]: accion.resultado },
      };
    case "veredicto":
      return {
        ...estado,
        enviando: null,
        progreso: accion.progreso,
        veredictos: { ...estado.veredictos, [accion.retoId]: accion.veredicto },
      };
  }
}

/** Lecciones en orden de lectura, con su módulo. */
export function recorrido(curso: CursoCatalogo): { modulo: ModuloCurso; leccion: Leccion }[] {
  return [...curso.modulos]
    .sort((a, b) => a.orden - b.orden)
    .flatMap((modulo) =>
      [...modulo.lecciones].sort((a, b) => a.orden - b.orden).map((leccion) => ({ modulo, leccion }))
    );
}

/** Donde retomar: la primera lección sin completar (o la primera de todas). */
function primeraPendiente(curso: CursoCatalogo, progreso: ProgresoCatalogo | null): Seleccion | null {
  const lista = recorrido(curso);
  const hechas = new Set(progreso?.lecciones_completadas ?? []);
  const pendiente = lista.find(({ leccion }) => !hechas.has(leccion.id));
  if (pendiente) return { tipo: "leccion", id: pendiente.leccion.id };
  const conEvaluacion = curso.modulos.find(
    (m) => m.evaluacion && !progreso?.evaluaciones_aprobadas.includes(m.evaluacion.id)
  );
  if (conEvaluacion) return { tipo: "evaluacion_modulo", moduloId: conEvaluacion.id };
  return lista[0] ? { tipo: "leccion", id: lista[0].leccion.id } : null;
}

function mensaje(e: unknown): string {
  return e instanceof ApiError ? e.message : "Error inesperado.";
}

export function useReproductor(cursoId: string) {
  const [estado, despachar] = useReducer(reducir, INICIAL);

  const cargar = useCallback(async () => {
    despachar({ tipo: "cargando" });
    try {
      const { curso, progreso } = await obtenerCursoCatalogo(cursoId);
      despachar({ tipo: "cargado", curso, progreso });
    } catch (e) {
      despachar({ tipo: "error", mensaje: mensaje(e) });
    }
  }, [cursoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // --- derivados ---
  const lista = useMemo(() => (estado.curso ? recorrido(estado.curso) : []), [estado.curso]);
  const actual = useMemo(() => {
    const s = estado.seleccion;
    if (!s || !estado.curso) return null;
    if (s.tipo === "leccion") return lista.find((x) => x.leccion.id === s.id) ?? null;
    return null;
  }, [estado.seleccion, estado.curso, lista]);
  const moduloEvaluado = useMemo(() => {
    const s = estado.seleccion;
    if (!s || s.tipo !== "evaluacion_modulo" || !estado.curso) return null;
    return estado.curso.modulos.find((m) => m.id === s.moduloId) ?? null;
  }, [estado.seleccion, estado.curso]);

  const completada = useCallback(
    (leccionId: string) => estado.progreso?.lecciones_completadas.includes(leccionId) ?? false,
    [estado.progreso]
  );
  const aprobada = useCallback(
    (ev: Evaluacion) => estado.progreso?.evaluaciones_aprobadas.includes(ev.id) ?? false,
    [estado.progreso]
  );

  /** Pasos posibles desde lo que se está viendo: siguiente lección o la evaluación del módulo. */
  const siguiente = useMemo((): Seleccion | null => {
    if (!estado.curso) return null;
    const modulos = [...estado.curso.modulos].sort((a, b) => a.orden - b.orden);
    if (actual) {
      const delModulo = [...actual.modulo.lecciones].sort((a, b) => a.orden - b.orden);
      const esUltima = delModulo[delModulo.length - 1]?.id === actual.leccion.id;
      if (esUltima && actual.modulo.evaluacion) return { tipo: "evaluacion_modulo", moduloId: actual.modulo.id };
      const i = lista.findIndex((x) => x.leccion.id === actual.leccion.id);
      return lista[i + 1] ? { tipo: "leccion", id: lista[i + 1].leccion.id } : null;
    }
    if (moduloEvaluado) {
      const sigModulo = modulos[modulos.findIndex((m) => m.id === moduloEvaluado.id) + 1];
      const primera = sigModulo ? [...sigModulo.lecciones].sort((a, b) => a.orden - b.orden)[0] : undefined;
      return primera ? { tipo: "leccion", id: primera.id } : null;
    }
    return null;
  }, [estado.curso, actual, moduloEvaluado, lista]);

  // --- acciones ---
  const seleccionar = useCallback((seleccion: Seleccion) => {
    despachar({ tipo: "seleccionar", seleccion });
  }, []);

  const completar = useCallback(
    async (leccionId: string) => {
      despachar({ tipo: "enviando", que: "completar" });
      try {
        despachar({ tipo: "progreso", progreso: await completarLeccionCatalogo(cursoId, leccionId) });
      } catch (e) {
        despachar({ tipo: "error", mensaje: mensaje(e) });
      }
    },
    [cursoId]
  );

  const evaluar = useCallback(
    /** Devuelve si hubo corrección (false = error de red/servidor, ya en `error`). */
    async (evaluacionId: string, respuestas: Record<string, number>): Promise<boolean> => {
      despachar({ tipo: "enviando", que: evaluacionId });
      try {
        const { resultado, progreso } = await evaluarCatalogo(cursoId, evaluacionId, respuestas);
        despachar({ tipo: "resultado", resultado, progreso });
        return true;
      } catch (e) {
        despachar({ tipo: "error", mensaje: mensaje(e) });
        return false;
      }
    },
    [cursoId]
  );

  const revisarReto = useCallback(
    async (retoId: string, codigo: string) => {
      despachar({ tipo: "enviando", que: retoId });
      try {
        const { veredicto, progreso } = await revisarRetoCatalogo(cursoId, retoId, codigo);
        despachar({ tipo: "veredicto", retoId, veredicto, progreso });
      } catch (e) {
        despachar({ tipo: "error", mensaje: mensaje(e) });
      }
    },
    [cursoId]
  );

  return {
    ...estado,
    lista,
    actual,
    moduloEvaluado,
    siguiente,
    completada,
    aprobada,
    cargar,
    seleccionar,
    completar,
    evaluar,
    revisarReto,
  };
}

export type Reproductor = ReturnType<typeof useReproductor>;
