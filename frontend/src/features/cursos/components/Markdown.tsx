import { Fragment, type ReactNode } from "react";
import { BloqueCodigo } from "./BloqueCodigo";

/**
 * Markdown de las lecciones y del tutor, convertido a elementos React.
 *
 * Deliberadamente NO usa `innerHTML`: el texto del tutor viene de un modelo de
 * IA y no puede inyectar HTML. Cubre lo que usan los cursos: títulos (##/###),
 * párrafos, listas, citas, tablas, bloques de código con lenguaje, y en línea
 * **negrita**, *cursiva* y `código`.
 */
export function Markdown({ texto }: { texto: string }) {
  return <div className="space-y-3 text-sm leading-relaxed text-ink-body">{bloques(texto)}</div>;
}

/** Solo el formato en línea (`código`, **negrita**, *cursiva*): para enunciados y opciones. */
export function MarkdownEnLinea({ texto }: { texto: string }) {
  return <>{enLinea(texto)}</>;
}

function bloques(texto: string): ReactNode[] {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const salida: ReactNode[] = [];
  let i = 0;
  const clave = () => `b${salida.length}`;

  while (i < lineas.length) {
    const linea = lineas[i];
    const recortada = linea.trim();

    if (!recortada) {
      i++;
      continue;
    }

    // ```lenguaje … ```
    if (recortada.startsWith("```")) {
      const lenguaje = recortada.slice(3).trim() || "text";
      const codigo: string[] = [];
      i++;
      while (i < lineas.length && !lineas[i].trim().startsWith("```")) codigo.push(lineas[i++]);
      i++;
      salida.push(<BloqueCodigo key={clave()} codigo={codigo.join("\n")} lenguaje={lenguaje} />);
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(recortada);
    if (titulo) {
      const nivel = titulo[1].length;
      const clase =
        nivel <= 2 ? "pt-3 text-subhead text-ink" : "pt-1 text-base font-semibold text-ink";
      salida.push(
        nivel <= 2 ? (
          <h3 key={clave()} className={clase}>{enLinea(titulo[2])}</h3>
        ) : (
          <h4 key={clave()} className={clase}>{enLinea(titulo[2])}</h4>
        )
      );
      i++;
      continue;
    }

    // | tabla |
    if (recortada.startsWith("|")) {
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith("|")) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!celdas.every((c) => /^:?-{3,}:?$/.test(c))) filas.push(celdas);
        i++;
      }
      const [cabecera, ...cuerpo] = filas;
      salida.push(
        <div key={clave()} className="overflow-x-auto rounded-lg border border-black/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-sunken text-ink">
              <tr>{cabecera?.map((c, k) => <th key={k} className="px-3 py-2 font-semibold">{enLinea(c)}</th>)}</tr>
            </thead>
            <tbody>
              {cuerpo.map((fila, f) => (
                <tr key={f} className="border-t border-black/5">
                  {fila.map((c, k) => <td key={k} className="px-3 py-2 align-top">{enLinea(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // > cita
    if (recortada.startsWith(">")) {
      const cita: string[] = [];
      while (i < lineas.length && lineas[i].trim().startsWith(">")) cita.push(lineas[i++].trim().replace(/^>\s?/, ""));
      salida.push(
        <blockquote key={clave()} className="border-l-2 border-brand-600 bg-brand-50 px-4 py-2 text-ink">
          {enLinea(cita.join(" "))}
        </blockquote>
      );
      continue;
    }

    // - lista  /  1. lista
    const esLista = (l: string) => /^([-*]|\d+\.)\s+/.test(l.trim());
    if (esLista(recortada)) {
      const ordenada = /^\d+\./.test(recortada);
      const items: string[] = [];
      while (i < lineas.length && (esLista(lineas[i]) || (lineas[i].startsWith("  ") && lineas[i].trim() && items.length))) {
        if (esLista(lineas[i])) items.push(lineas[i].trim().replace(/^([-*]|\d+\.)\s+/, ""));
        else items[items.length - 1] += " " + lineas[i].trim();
        i++;
      }
      const Lista = ordenada ? "ol" : "ul";
      salida.push(
        <Lista key={clave()} className={`space-y-1 pl-5 ${ordenada ? "list-decimal" : "list-disc"}`}>
          {items.map((item, k) => <li key={k}>{enLinea(item)}</li>)}
        </Lista>
      );
      continue;
    }

    // Párrafo: líneas seguidas hasta una vacía o un bloque nuevo.
    const parrafo: string[] = [];
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !/^(```|#{1,4}\s|\||>)/.test(lineas[i].trim()) &&
      !esLista(lineas[i])
    ) {
      parrafo.push(lineas[i++].trim());
    }
    salida.push(<p key={clave()}>{enLinea(parrafo.join(" "))}</p>);
  }
  return salida;
}

/** `código`, **negrita** y *cursiva* dentro de una línea. */
function enLinea(texto: string): ReactNode {
  const partes = texto.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return partes.map((parte, k) => {
    if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 1) {
      return (
        <code key={k} className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">
          {parte.slice(1, -1)}
        </code>
      );
    }
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 3) {
      return <strong key={k} className="font-semibold text-ink">{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) {
      return <em key={k}>{parte.slice(1, -1)}</em>;
    }
    return <Fragment key={k}>{parte}</Fragment>;
  });
}
