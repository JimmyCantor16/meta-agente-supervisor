"""Prueba de que el MVP usa la base de datos QUE SE PIDIÓ.

Sin red y sin gastar cupo: se construye el proyecto en memoria y se mira.

QUÉ DEMUESTRA
-------------
1. Si el encargo pide MySQL o PostgreSQL, el proyecto sale con ESE motor: su
   driver declarado, su servicio en el compose y su ejemplo en `.env.example`.
2. La conexión se lee del entorno, nunca escrita fija en el código.
3. El prefijo de la URL se normaliza al driver que el proyecto declara.
4. Las columnas de texto llevan longitud (MySQL exige VARCHAR(n)).

POR QUÉ EXISTE
--------------
Dos veces seguidas, lo mismo: el proyecto declaraba un driver y la URL pedía
otro, así que SQLAlchemy buscaba el de por defecto y la aplicación moría al
arrancar con `ModuleNotFoundError: No module named 'psycopg2'` (o MySQLdb).
Es un fallo invisible en SQLite —el motor por defecto funciona— y fatal en
cuanto alguien pide un motor de verdad. Aquí queda atado.

    cd backend
    python pruebas/base_de_datos_pedida.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.dominio_app import Campo, DominioApp  # noqa: E402
from src.infrastructure.adapters import skeleton_dominio as be  # noqa: E402
from src.infrastructure.adapters.skeleton_dominio_armar import (  # noqa: E402
    construir_desde_dominio,
)


def dominio(motor: str) -> DominioApp:
    return DominioApp(
        app_name="Clínica Veterinaria",
        entidad="Consulta",
        entidad_plural="Consultas",
        motor=motor,
        campos=[
            Campo(nombre="mascota", etiqueta="Mascota", tipo="texto", obligatorio=True),
            Campo(nombre="precio", etiqueta="Precio", tipo="decimal", minimo=0),
        ],
    )


def archivos(motor: str) -> dict[str, str]:
    return {f.path: f.content for f in construir_desde_dominio(dominio(motor)).files}


def main() -> int:
    print("1. EL MOTOR PEDIDO ES EL QUE SE ENTREGA")
    esperado = {
        "sqlite": ("", False),
        "mysql": ("pymysql", True),
        "postgres": ("psycopg", True),
    }
    for motor, (driver, con_compose) in esperado.items():
        f = archivos(motor)
        reqs = f["backend/requirements.txt"]
        tiene_driver = (driver in reqs) if driver else not any(
            d in reqs for d in ("pymysql", "psycopg")
        )
        tiene_compose = "docker-compose.yml" in f
        print(f"   {motor:9} driver={'ok' if tiene_driver else 'MAL'} "
              f"compose={'ok' if tiene_compose == con_compose else 'MAL'}")
        assert tiene_driver, f"{motor}: el driver no está declarado en requirements"
        assert tiene_compose == con_compose, f"{motor}: el compose no corresponde"
        assert "DATABASE_URL" in f[".env.example"], f"{motor}: .env.example sin DATABASE_URL"

    print("\n2. LA CONEXIÓN SE LEE DEL ENTORNO, NO ESTÁ FIJA EN EL CÓDIGO")
    db = archivos("mysql")["backend/infrastructure/db.py"]
    assert 'os.environ.get("DATABASE_URL")' in db, "no lee DATABASE_URL"
    assert "usuario:clave@" not in db, "hay una cadena de conexión escrita a mano"
    print("   ok  lee DATABASE_URL y no lleva credenciales dentro")

    print("\n3. EL PREFIJO SE NORMALIZA AL DRIVER DECLARADO")
    bloque = db[db.index("_URL = os.environ"):db.index("_opciones")]
    casos = {
        "postgresql://u:c@h:5432/b": "postgresql+psycopg://u:c@h:5432/b",
        "postgres://u:c@h:5432/b": "postgresql+psycopg://u:c@h:5432/b",
        "mysql://u:c@h:3306/b": "mysql+pymysql://u:c@h:3306/b",
        "mysql+pymysql://u:c@h/b": "mysql+pymysql://u:c@h/b",
        "postgresql+psycopg://u@h/b": "postgresql+psycopg://u@h/b",
        "sqlite:///./app.db": "sqlite:///./app.db",
    }
    previo = os.environ.get("DATABASE_URL")
    try:
        for entrada, salida in casos.items():
            os.environ["DATABASE_URL"] = entrada
            espacio: dict = {"os": os}
            exec(bloque, espacio)  # noqa: S102 - se ejecuta el bloque REAL, no una copia
            real = espacio["_URL"]
            print(f"   {'ok ' if real == salida else 'MAL'} {entrada:30} -> {real}")
            assert real == salida, f"{entrada} debía quedar como {salida}"
    finally:
        os.environ.pop("DATABASE_URL", None)
        if previo is not None:
            os.environ["DATABASE_URL"] = previo

    print("\n4. LAS COLUMNAS DE TEXTO LLEVAN LONGITUD (MySQL exige VARCHAR(n))")
    sin_longitud = [ln.strip() for ln in db.splitlines() if "Column(String," in ln]
    print("   columnas String sin longitud:", sin_longitud or "ninguna")
    assert not sin_longitud, "MySQL rechaza un VARCHAR sin longitud"

    print("\n5. EL VERIFICADOR PRESTA EL MOTOR QUE EL PROYECTO DECLARA")
    import tempfile

    from src.infrastructure.adapters.db_verificacion import motor_requerido

    for motor, esperado_motor in (("sqlite", None), ("mysql", "mysql"), ("postgres", "postgres")):
        carpeta = Path(tempfile.mkdtemp(prefix=f"bd-{motor}-"))
        for ruta, contenido in archivos(motor).items():
            destino = carpeta / ruta
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(contenido, encoding="utf-8")
        detectado = motor_requerido(str(carpeta))
        print(f"   {'ok ' if detectado == esperado_motor else 'MAL'} declara {motor:9} -> detecta {detectado}")
        assert detectado == esperado_motor, (
            f"un proyecto de {motor} se detectó como {detectado}: se le prestaría "
            "el motor equivocado y moriría con ModuleNotFoundError"
        )

    print("\nTODO CORRECTO: quien pide MySQL recibe MySQL, y la aplicación")
    print("arranca porque el driver declarado y la URL hablan el mismo idioma.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
