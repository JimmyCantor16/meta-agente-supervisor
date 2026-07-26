import { MultimediaProvider } from "./MultimediaProvider";
import { MultimediaDock } from "./MultimediaDock";

/**
 * Punto de entrada del módulo Multimedia: monta el Provider (reproductor
 * persistente de TV/Radio) y el Dock (pestaña derecha + panel). Se coloca una
 * sola vez en <App />, por encima de todo, sin tocar el backend.
 */
export function Multimedia() {
  return (
    <MultimediaProvider>
      <MultimediaDock />
    </MultimediaProvider>
  );
}
