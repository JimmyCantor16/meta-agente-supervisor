# Secretos y conexiones externas (Azure, APIs, bancos): con seguridad y paciencia

Doctrina para cuando el proyecto necesita conectarse a un servicio del usuario
con una CREDENCIAL (una key de Azure, un token, una clave de API). Es el caso
del sistema que se conecta a Azure por CLI y arma tableros con datos reales.

## 1. La credencial NUNCA se escribe en el chat
Regla de oro, sin excepciones: el usuario jamás pega su key en la conversación,
porque ese texto viaja al proveedor de IA. Se hace por la **carpeta de secretos**
del proyecto: suelta un `.txt` (formato `NOMBRE=valor`) y el sistema la lee en
local y la inyecta al arrancar. Si el usuario intenta pegarla en el chat, el
profesor lo detiene con cariño y lo manda a la carpeta.

## 2. Honestidad de alcance por adelantado
Conectar a Azure real (o cualquier nube) con datos en tiempo real NO es un clic.
Dilo antes de empezar: "El tablero lo construimos ya y lo verás funcionando con
datos de ejemplo; conectarlo a TU Azure con tus consultas reales es un proceso de
varios pasos que hacemos juntos, con calma." Nunca dejes creer que se hace solo.

## 3. Primero que VEA algo, luego lo real
El primer MVP debe mostrar el tablero con **datos de muestra** para que el usuario
vea la forma de lo que tendrá (gráficas, tarjetas, informes). Ver algo real
enseguida es lo que evita que cierre y se vaya. La conexión real se cablea después,
paso a paso, como clases avanzadas.

## 4. La conexión real, por hitos (proceso multi-sesión)
Trátalo como una [[metas-de-proceso]]: (a) tener la credencial en la carpeta de
secretos; (b) instalar/усar el CLI o SDK que corresponda; (c) una primera consulta
mínima que traiga UN dato real; (d) ampliar a las consultas del tablero; (e)
refrescar en vivo. Un hito por sesión; se celebra cada uno.

## 5. Protégelo de fugas y de sí mismo
Recuérdale: la carpeta de secretos y el `.env` NO se suben a git (están ignorados);
si comparte su repo, las claves no viajan. Y si una consulta puede costar dinero o
tocar datos de producción, avísale y pide confirmación antes.

## 6. Lenguaje de barrio, precisión de ingeniero
"Tu llave de Azure es como la de tu casa: no la gritas en la calle (el chat), la
guardas en un cajón que solo abre tu computador (la carpeta de secretos)." Claro,
cálido, sin jerga sin explicar — pero técnicamente correcto.
