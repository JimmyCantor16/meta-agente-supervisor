"""Genera la aplicación A PARTIR DEL DOMINIO que describió el modelo.

Es la corrección del intercambio que salió mal: la plantilla fija daba
fiabilidad pero entregaba siempre la misma app. Aquí el modelo aporta el
DOMINIO (qué se guarda y de qué tipo) y este módulo escribe la plomería para
ese dominio concreto — modelos, validación, formularios, listados y cálculos.

El reparto de responsabilidades es el que funciona:
  · el modelo decide QUÉ (dominio), que es donde acierta;
  · el código decide CÓMO (cableado), que es donde el modelo falla.

Lo que no cambia entre proyectos (login, base de datos, seguridad) se reutiliza
tal cual del esqueleto probado.
"""

from __future__ import annotations

import html
import json
import secrets

from src.domain.dominio_app import Campo, DominioApp
from src.domain.entities import GeneratedFile, GeneratedProject
from src.infrastructure.adapters.skeleton_fullstack import (
    MARCADOR,
    _infra_security,
    _requirements,
)

# --- Cómo se traduce cada tipo a las cuatro capas ---------------------------
_COLUMNA = {
    "texto": "String(255)",
    "texto_largo": "Text",
    "entero": "Integer",
    "decimal": "Float",
    "fecha": "String(32)",   # ISO: simple, ordenable y sin líos de zona horaria
    "opcion": "String(120)",
    "booleano": "Boolean",
    # La relación guarda el NOMBRE visible del ítem del catálogo, no su id.
    # Deliberado: evita joins en todo el esqueleto (listados, resumen, seeds) y
    # el valor se valida contra el catálogo al crear/editar. Para un MVP, un
    # desplegable real + validación en servidor es el 90% del valor con el 30%
    # de la plomería.
    "relacion": "String(255)",
}
_PYTHON = {
    "texto": "str",
    "texto_largo": "str",
    "entero": "int",
    "decimal": "float",
    "fecha": "str",
    "opcion": "str",
    "booleano": "bool",
    "relacion": "str",
}
_INPUT = {
    "texto": 'type="text"',
    "entero": 'type="number" step="1"',
    "decimal": 'type="number" step="any"',
    "fecha": 'type="date"',
    "booleano": 'type="checkbox"',
}


def _tipo_py(c: Campo) -> str:
    base = _PYTHON[c.tipo]
    return base if c.obligatorio else f"{base} | None"


# ---------------------------------------------------------------------------
# BACKEND
# ---------------------------------------------------------------------------
def _entities(d: DominioApp) -> str:
    campos = "\n".join(f"    {c.nombre}: {_tipo_py(c)}" for c in d.campos)
    return f'''"""Dominio: entidades puras. NO importan FastAPI ni SQLAlchemy."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class User:
    id: int | None
    username: str
    #: El administrador es el dueño del negocio: ve todos los registros y
    #: gestiona los catálogos. Los demás solo ven y tocan lo suyo.
    es_admin: bool = False


@dataclass
class {d.clase}:
    """Un registro de {d.entidad_plural.lower()}."""

    id: int | None
{campos}
    owner_id: int
'''


def _ports(d: DominioApp) -> str:
    return f'''"""Puertos: contratos que la aplicación necesita."""
from __future__ import annotations

from abc import ABC, abstractmethod

from .entities import {d.clase}, User


class UserRepository(ABC):
    @abstractmethod
    def by_username(self, username: str) -> User | None: ...
    @abstractmethod
    def create(self, username: str, hashed_password: str) -> User: ...
    @abstractmethod
    def hashed_password(self, username: str) -> str | None: ...


class {d.clase}Repository(ABC):
    @abstractmethod
    def list_for(self, owner_id: int) -> list[{d.clase}]: ...
    @abstractmethod
    def list_all(self) -> list[tuple[{d.clase}, str]]:
        """Todos los registros con el nombre de su dueño (vista del administrador)."""
    @abstractmethod
    def create(self, owner_id: int, datos: dict) -> {d.clase}: ...
    @abstractmethod
    def get(self, registro_id: int, owner_id: int) -> {d.clase} | None: ...
    @abstractmethod
    def update(self, registro_id: int, owner_id: int, datos: dict) -> {d.clase} | None: ...
    @abstractmethod
    def delete(self, registro_id: int, owner_id: int) -> bool: ...
    @abstractmethod
    def update_any(self, registro_id: int, datos: dict) -> {d.clase} | None:
        """Actualiza sin mirar el dueño. SOLO lo usa el administrador."""
    @abstractmethod
    def delete_any(self, registro_id: int) -> bool:
        """Borra sin mirar el dueño. SOLO lo usa el administrador."""


class CatalogoRepository(ABC):
    """Las entidades de apoyo del negocio (lo que administra el dueño)."""

    @abstractmethod
    def listar(self, slug: str) -> list[dict]: ...
    @abstractmethod
    def crear(self, slug: str, datos: dict) -> dict: ...
    @abstractmethod
    def borrar(self, slug: str, item_id: int) -> bool: ...
    @abstractmethod
    def existe_valor(self, slug: str, valor: str) -> bool:
        """¿Hay un ítem cuyo nombre visible sea `valor`? (valida las relaciones)."""


class PasswordHasher(ABC):
    @abstractmethod
    def hash(self, plain: str) -> str: ...
    @abstractmethod
    def verify(self, plain: str, hashed: str) -> bool: ...


class TokenService(ABC):
    @abstractmethod
    def issue(self, username: str) -> str: ...
    @abstractmethod
    def username_from(self, token: str) -> str | None: ...
'''


def _reglas_validacion(d: DominioApp) -> str:
    """Validación por campo, escrita a partir del tipo declarado."""
    lineas: list[str] = []
    for c in d.campos:
        v = f"datos.get({c.nombre!r})"
        if c.obligatorio:
            lineas.append(
                f"    if {v} in (None, ''):\n"
                f"        raise ValidacionError('{c.etiqueta} es obligatorio.')"
            )
        if c.tipo in ("entero", "decimal"):
            conv = "int" if c.tipo == "entero" else "float"
            lineas.append(
                f"    if {v} not in (None, ''):\n"
                f"        try:\n"
                f"            limpio[{c.nombre!r}] = {conv}({v})\n"
                f"        except (TypeError, ValueError):\n"
                f"            raise ValidacionError('{c.etiqueta} debe ser un número.')"
            )
            if c.minimo is not None:
                lineas.append(
                    f"    if limpio.get({c.nombre!r}) is not None and limpio[{c.nombre!r}] < {c.minimo}:\n"
                    f"        raise ValidacionError('{c.etiqueta} no puede ser menor que {c.minimo:g}.')"
                )
            if c.maximo is not None:
                lineas.append(
                    f"    if limpio.get({c.nombre!r}) is not None and limpio[{c.nombre!r}] > {c.maximo}:\n"
                    f"        raise ValidacionError('{c.etiqueta} no puede ser mayor que {c.maximo:g}.')"
                )
        elif c.tipo == "opcion":
            lineas.append(
                f"    if {v} not in (None, '') and {v} not in {c.opciones!r}:\n"
                f"        raise ValidacionError('{c.etiqueta} debe ser una de: ' + ', '.join({c.opciones!r}))"
            )
        elif c.tipo == "booleano":
            lineas.append(f"    limpio[{c.nombre!r}] = bool({v})")
        else:
            lineas.append(
                f"    if {v} is not None:\n"
                f"        limpio[{c.nombre!r}] = str({v}).strip()"
            )
    return "\n".join(lineas) if lineas else "    pass"


def _services(d: DominioApp) -> str:
    calculos = []
    for c in d.calculos:
        if c.operacion == "conteo":
            calculos.append(f"        resultado[{c.etiqueta!r}] = len(registros)")
        else:
            op = {"suma": "sum", "promedio": "mean", "maximo": "max", "minimo": "min"}[c.operacion]
            calculos.append(
                f"        valores = [getattr(r, {c.campo!r}) for r in registros "
                f"if getattr(r, {c.campo!r}, None) is not None]\n"
                f"        resultado[{c.etiqueta!r}] = "
                + (
                    f"round(sum(valores) / len(valores), 2) if valores else 0"
                    if op == "mean"
                    else f"{op}(valores) if valores else 0"
                )
            )
    bloque_calculos = "\n".join(calculos) if calculos else "        pass"

    # --- Literales del dominio que la validación necesita en tiempo de ejecución ---
    relaciones = {
        c.nombre: d.catalogo_de(c).slug  # type: ignore[union-attr]
        for c in d.campos
        if c.tipo == "relacion" and d.catalogo_de(c) is not None
    }
    campos_catalogos = {
        cat.slug: [
            {
                "nombre": c.nombre, "etiqueta": c.etiqueta, "tipo": c.tipo,
                "obligatorio": c.obligatorio, "opciones": c.opciones,
                "minimo": c.minimo, "maximo": c.maximo,
            }
            for c in cat.campos
        ]
        for cat in d.catalogos
    }

    return f'''"""Casos de uso: dependen SOLO de puertos."""
from __future__ import annotations

import re

from backend.domain.entities import {d.clase}, User
from backend.domain.ports import (
    CatalogoRepository,
    PasswordHasher,
    TokenService,
    UserRepository,
    {d.clase}Repository,
)


class AuthError(Exception):
    """Credenciales inválidas o usuario ya existente."""


class ValidacionError(Exception):
    """Los datos recibidos no cumplen las reglas del dominio."""


class PermisoError(Exception):
    """La operación exige ser administrador."""


MIN_USUARIO = 3
MAX_USUARIO = 30
MIN_CLAVE = 8


def validar_credenciales(username: str, password: str) -> tuple[str, str]:
    """Reglas de cuenta: sin esto, «1» con clave «1» pasaría sin más."""
    usuario = (username or "").strip()
    clave = password or ""
    if len(usuario) < MIN_USUARIO:
        raise ValidacionError(f"El usuario debe tener al menos {{MIN_USUARIO}} caracteres.")
    if len(usuario) > MAX_USUARIO:
        raise ValidacionError(f"El usuario no puede pasar de {{MAX_USUARIO}} caracteres.")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", usuario):
        raise ValidacionError("El usuario solo admite letras, números, punto, guion y guion bajo.")
    if len(clave) < MIN_CLAVE:
        raise ValidacionError(f"La contraseña debe tener al menos {{MIN_CLAVE}} caracteres.")
    if clave.isdigit() or clave.isalpha():
        raise ValidacionError("La contraseña debe combinar letras y números.")
    if clave.lower() == usuario.lower():
        raise ValidacionError("La contraseña no puede ser igual al usuario.")
    return usuario, clave


def validar_{d.tabla}(datos: dict) -> dict:
    """Comprueba los datos de {d.entidad_plural.lower()} y devuelve los valores limpios.

    Las reglas salen del dominio declarado: tipos, obligatoriedad y rangos.
    """
    limpio = dict(datos)
{_reglas_validacion(d)}
    return limpio


class AuthService:
    def __init__(self, users: UserRepository, hasher: PasswordHasher, tokens: TokenService) -> None:
        self._users = users
        self._hasher = hasher
        self._tokens = tokens

    def register(self, username: str, password: str) -> User:
        usuario, clave = validar_credenciales(username, password)
        if self._users.by_username(usuario):
            raise AuthError("Ese usuario ya está registrado")
        return self._users.create(usuario, self._hasher.hash(clave))

    def login(self, username: str, password: str) -> str:
        hashed = self._users.hashed_password(username)
        if not hashed or not self._hasher.verify(password, hashed):
            raise AuthError("Usuario o contraseña incorrectos")
        return self._tokens.issue(username)

    def user_from_token(self, token: str) -> User | None:
        username = self._tokens.username_from(token)
        return self._users.by_username(username) if username else None


#: Campos de {d.entidad_plural.lower()} que apuntan a un catálogo. El valor debe
#: existir allí: sin esta comprobación, el desplegable del frontend sería pura
#: decoración (con la API a mano se podría guardar cualquier cosa).
RELACIONES: dict[str, str] = {relaciones!r}

#: Definición de los campos de cada catálogo, para validar las altas del admin.
CAMPOS_CATALOGOS: dict = {campos_catalogos!r}


def validar_catalogo(slug: str, datos: dict) -> dict:
    """Valida un ítem de catálogo contra su definición declarada."""
    campos = CAMPOS_CATALOGOS.get(slug)
    if campos is None:
        raise ValidacionError("Ese catálogo no existe.")
    limpio: dict = {{}}
    for campo in campos:
        bruto = datos.get(campo["nombre"])
        vacio = bruto is None or str(bruto).strip() == ""
        if campo["obligatorio"] and vacio:
            raise ValidacionError(campo["etiqueta"] + " es obligatorio.")
        if vacio:
            continue
        if campo["tipo"] in ("entero", "decimal"):
            try:
                numero = int(bruto) if campo["tipo"] == "entero" else float(bruto)
            except (TypeError, ValueError):
                raise ValidacionError(campo["etiqueta"] + " debe ser un número.")
            if campo["minimo"] is not None and numero < campo["minimo"]:
                raise ValidacionError(campo["etiqueta"] + " es demasiado pequeño.")
            if campo["maximo"] is not None and numero > campo["maximo"]:
                raise ValidacionError(campo["etiqueta"] + " es demasiado grande.")
            limpio[campo["nombre"]] = numero
        elif campo["tipo"] == "opcion":
            if str(bruto) not in campo["opciones"]:
                raise ValidacionError(campo["etiqueta"] + " debe ser una de: " + ", ".join(campo["opciones"]))
            limpio[campo["nombre"]] = str(bruto)
        elif campo["tipo"] == "booleano":
            limpio[campo["nombre"]] = bool(bruto)
        else:
            limpio[campo["nombre"]] = str(bruto).strip()[:500]
    return limpio


class CatalogoService:
    """Lo que administra el dueño: consultar es de todos, tocar es del admin."""

    def __init__(self, repo: CatalogoRepository) -> None:
        self._repo = repo

    def listar_todos(self) -> dict:
        return {{slug: self._repo.listar(slug) for slug in CAMPOS_CATALOGOS}}

    def crear(self, user: User, slug: str, datos: dict) -> dict:
        if not user.es_admin:
            raise PermisoError("Solo el administrador puede modificar los catálogos.")
        return self._repo.crear(slug, validar_catalogo(slug, datos))

    def borrar(self, user: User, slug: str, item_id: int) -> bool:
        if not user.es_admin:
            raise PermisoError("Solo el administrador puede modificar los catálogos.")
        if slug not in CAMPOS_CATALOGOS:
            raise ValidacionError("Ese catálogo no existe.")
        return self._repo.borrar(slug, item_id)


class {d.clase}Service:
    def __init__(self, repo: {d.clase}Repository, catalogos: CatalogoRepository | None = None) -> None:
        self._repo = repo
        self._catalogos = catalogos

    def _validar_relaciones(self, datos: dict) -> dict:
        for campo, slug in RELACIONES.items():
            valor = datos.get(campo)
            if valor and self._catalogos is not None and not self._catalogos.existe_valor(slug, str(valor)):
                raise ValidacionError(f"'{{valor}}' no está en el catálogo. Elige una de las opciones.")
        return datos

    def list_para(self, user: User) -> list[tuple[{d.clase}, str | None]]:
        """Lo que este usuario tiene derecho a ver.

        El administrador ve TODO y con el nombre de cada dueño: es la dueña del
        negocio mirando su agenda, no un usuario más mirando la suya.
        """
        if user.es_admin:
            return [(r, dueno) for r, dueno in self._repo.list_all()]
        return [(r, None) for r in self._repo.list_for(user.id)]

    def create(self, owner_id: int, datos: dict) -> {d.clase}:
        return self._repo.create(owner_id, self._validar_relaciones(validar_{d.tabla}(datos)))

    def update_como(self, user: User, registro_id: int, datos: dict) -> {d.clase} | None:
        """El admin corrige el registro de cualquiera; los demás, solo el suyo.

        Tiene que ser simétrico con `delete_como`: si el administrador ve todos
        los registros y puede cancelarlos, no poder CORREGIR uno sería una
        asimetría sin explicación — vería la errata y no podría tocarla.
        """
        limpio = self._validar_relaciones(validar_{d.tabla}(datos))
        if user.es_admin:
            return self._repo.update_any(registro_id, limpio)
        return self._repo.update(registro_id, user.id, limpio)

    def delete_como(self, user: User, registro_id: int) -> bool:
        """El admin puede cancelar el registro de cualquiera; los demás, el suyo."""
        if user.es_admin:
            return self._repo.delete_any(registro_id)
        return self._repo.delete(registro_id, user.id)

    def resumen_para(self, user: User) -> dict:
        """Los números que acompañan a la lista, sobre lo que este usuario VE."""
        registros = [r for r, _ in self.list_para(user)]
        resultado: dict = {{}}
{bloque_calculos}
        return resultado
'''


#: Credenciales de la cuenta de demostración. Fijas y visibles a propósito: se
#: enseñan en la propia pantalla de entrada y en el README, porque su razón de
#: ser es que un desconocido pueda mirar el sistema. No protegen nada — los
#: datos que hay dentro son inventados.
_USUARIO_DEMO = "demo"
_CLAVE_DEMO = "demo1234"

#: La cuenta del dueño del negocio. Fija y documentada en el MANUAL, que le
#: pide cambiar la contraseña como primer paso.
_ADMIN_USUARIO = "admin"
_ADMIN_CLAVE = "admin1234"


def _columnas_de(campos) -> str:
    filas = []
    for c in campos:
        tipo = _COLUMNA[c.tipo]
        nulo = "False" if c.obligatorio else "True"
        extra = ", default=False" if c.tipo == "booleano" else ""
        filas.append(f"    {c.nombre} = Column({tipo}, nullable={nulo}{extra})")
    return "\n".join(filas)


def _db(d: DominioApp) -> str:
    ejemplos = d.ejemplos
    columnas = []
    for c in d.campos:
        tipo = _COLUMNA[c.tipo]
        nulo = "False" if c.obligatorio else "True"
        extra = ", default=False" if c.tipo == "booleano" else ""
        columnas.append(f"    {c.nombre} = Column({tipo}, nullable={nulo}{extra})")

    # Un modelo ORM por catálogo, cada uno con sus columnas declaradas.
    modelos_catalogo = "\n\n".join(
        f"class {cat.clase}Model(Base):\n"
        f'    __tablename__ = "{cat.tabla}"\n'
        f"    id = Column(Integer, primary_key=True, index=True)\n"
        f"{_columnas_de(cat.campos)}"
        for cat in d.catalogos
    )
    semillas_catalogos = "\n    ".join(
        f"({cat.clase}Model, {cat.ejemplos!r})," for cat in d.catalogos
    ) or "# (sin catálogos que sembrar)"

    return f'''"""Infraestructura: base de datos y modelos ORM."""
from __future__ import annotations

import os

from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text, create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# La conexión se lee del ENTORNO, nunca fija en el código: así el mismo código
# corre con SQLite en tu portátil y con el MySQL o el PostgreSQL de tu servidor
# sin tocar una línea. Si no hay nada configurado, usa un archivo SQLite local.
_URL = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "sqlite:///./app.db"

# El prefijo se normaliza al driver que ESTE proyecto declara en requirements.
# Sin esto, SQLAlchemy elige el driver por defecto de cada motor —psycopg2 para
# `postgresql://` y MySQLdb para `mysql://`— y ninguno de los dos está
# instalado: la aplicación muere al arrancar con `ModuleNotFoundError`.
# Los prefijos ya explícitos se dejan intactos.
for _viejo, _nuevo in (
    ("postgresql+", None),
    ("mysql+", None),
    ("postgresql://", "postgresql+psycopg://"),
    ("postgres://", "postgresql+psycopg://"),
    ("mysql://", "mysql+pymysql://"),
):
    if _URL.startswith(_viejo):
        if _nuevo:
            _URL = _nuevo + _URL[len(_viejo):]
        break

# `check_same_thread` es exclusivo de SQLite: pasárselo a otro motor lo revienta.
_opciones = {{"connect_args": {{"check_same_thread": False}}}} if _URL.startswith("sqlite") else {{"pool_pre_ping": True}}

engine = create_engine(_URL, **_opciones)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    es_admin = Column(Boolean, nullable=False, default=False)


class {d.clase}Model(Base):
    __tablename__ = "{d.tabla}"
    id = Column(Integer, primary_key=True, index=True)
{chr(10).join(columnas)}
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)


{modelos_catalogo or "# (esta aplicación no declara catálogos)"}


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


#: Cuenta de demostración. Existe para que quien reciba el enlace pueda MIRAR
#: el sistema en un clic, con datos dentro, sin registrarse. Sin esto, un
#: contacto abre una pantalla de login y un listado vacío: parece roto.
USUARIO_DEMO = "{_USUARIO_DEMO}"
CLAVE_DEMO = "{_CLAVE_DEMO}"

#: La cuenta del DUEÑO del negocio. Fija y documentada en el MANUAL: quien
#: recibe el sistema entra con ella, gestiona sus catálogos y ve todo. Cambiar
#: su contraseña es lo primero que el manual le pide hacer.
ADMIN_USUARIO = "{_ADMIN_USUARIO}"
ADMIN_CLAVE = "{_ADMIN_CLAVE}"

_EJEMPLOS = {ejemplos!r}


def sembrar_demostracion(hasher) -> bool:
    """Deja el sistema LISTO PARA USAR en el primer arranque. True si sembró algo.

    Tres siembras independientes, cada una de un solo disparo:
      1. La cuenta del administrador (siempre, haya o no ejemplos).
      2. Los catálogos con sus filas iniciales (si sus tablas están vacías):
         sin barberos no se puede pedir cita, así que un catálogo vacío
         dejaría la aplicación inservible nada más nacer.
      3. La cuenta de demostración con sus registros (si hay ejemplos).
    """
    sembrado = False
    sesion = SessionLocal()
    try:
        admin = sesion.query(UserModel).filter(UserModel.username == ADMIN_USUARIO).first()
        if admin is None:
            sesion.add(UserModel(
                username=ADMIN_USUARIO, hashed_password=hasher.hash(ADMIN_CLAVE), es_admin=True,
            ))
            sesion.commit()
            sembrado = True

        for modelo, filas in _MODELOS_SEMILLA:
            if filas and sesion.query(modelo).first() is None:
                for fila in filas:
                    sesion.add(modelo(**fila))
                sesion.commit()
                sembrado = True

        if _EJEMPLOS:
            demo = sesion.query(UserModel).filter(UserModel.username == USUARIO_DEMO).first()
            if demo is None:
                demo = UserModel(username=USUARIO_DEMO, hashed_password=hasher.hash(CLAVE_DEMO))
                sesion.add(demo)
                sesion.flush()  # necesitamos su id para que los registros sean suyos
                for fila in _EJEMPLOS:
                    sesion.add({d.clase}Model(owner_id=demo.id, **fila))
                sesion.commit()
                sembrado = True
        return sembrado
    except Exception:  # noqa: BLE001 - sin datos de ejemplo la app sigue sirviendo
        sesion.rollback()
        return sembrado
    finally:
        sesion.close()


#: (modelo ORM, filas iniciales) de cada catálogo, para la siembra.
_MODELOS_SEMILLA = [
    {semillas_catalogos}
]
'''


def _repositories(d: DominioApp) -> str:
    campos = ", ".join(f"{c.nombre}=row.{c.nombre}" for c in d.campos)
    asignaciones = "\n".join(
        f"        if {c.nombre!r} in datos:\n            row.{c.nombre} = datos[{c.nombre!r}]"
        for c in d.campos
    )
    creacion = ", ".join(f"{c.nombre}=datos.get({c.nombre!r})" for c in d.campos)

    # Literales por catálogo: su modelo, sus columnas y cuál es el nombre visible.
    imports_cat = "".join(f", {cat.clase}Model" for cat in d.catalogos)
    modelos_cat = ", ".join(f"{cat.slug!r}: {cat.clase}Model" for cat in d.catalogos)
    columnas_cat = ", ".join(
        f"{cat.slug!r}: {[c.nombre for c in cat.campos]!r}" for cat in d.catalogos
    )
    visibles_cat = ", ".join(
        f"{cat.slug!r}: {cat.campos[0].nombre!r}" for cat in d.catalogos
    )

    return f'''"""Adaptadores: implementan los puertos con SQLAlchemy."""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.domain.entities import {d.clase}, User
from backend.domain.ports import CatalogoRepository, UserRepository, {d.clase}Repository
from backend.infrastructure.db import UserModel, {d.clase}Model{imports_cat}


def _a_user(row: UserModel) -> User:
    return User(id=row.id, username=row.username, es_admin=bool(row.es_admin))


def _a_entidad(row: {d.clase}Model) -> {d.clase}:
    return {d.clase}(id=row.id, {campos}, owner_id=row.owner_id)


class SqlUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def by_username(self, username: str) -> User | None:
        row = self._s.query(UserModel).filter(UserModel.username == username).first()
        return _a_user(row) if row else None

    def hashed_password(self, username: str) -> str | None:
        row = self._s.query(UserModel).filter(UserModel.username == username).first()
        return row.hashed_password if row else None

    def create(self, username: str, hashed_password: str) -> User:
        row = UserModel(username=username, hashed_password=hashed_password)
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _a_user(row)


class Sql{d.clase}Repository({d.clase}Repository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def list_for(self, owner_id: int) -> list[{d.clase}]:
        filas = (
            self._s.query({d.clase}Model)
            .filter({d.clase}Model.owner_id == owner_id)
            .order_by({d.clase}Model.id.desc())
            .all()
        )
        return [_a_entidad(f) for f in filas]

    def list_all(self) -> list[tuple[{d.clase}, str]]:
        """Todo con su dueño: la vista del administrador."""
        filas = (
            self._s.query({d.clase}Model, UserModel.username)
            .join(UserModel, UserModel.id == {d.clase}Model.owner_id)
            .order_by({d.clase}Model.id.desc())
            .all()
        )
        return [(_a_entidad(f), username) for f, username in filas]

    def create(self, owner_id: int, datos: dict) -> {d.clase}:
        row = {d.clase}Model(owner_id=owner_id, {creacion})
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _a_entidad(row)

    def get(self, registro_id: int, owner_id: int) -> {d.clase} | None:
        row = self._buscar(registro_id, owner_id)
        return _a_entidad(row) if row else None

    def update(self, registro_id: int, owner_id: int, datos: dict) -> {d.clase} | None:
        row = self._buscar(registro_id, owner_id)
        if row is None:
            return None
{asignaciones}
        self._s.commit()
        self._s.refresh(row)
        return _a_entidad(row)

    def delete(self, registro_id: int, owner_id: int) -> bool:
        row = self._buscar(registro_id, owner_id)
        if row is None:
            return False
        self._s.delete(row)
        self._s.commit()
        return True

    def update_any(self, registro_id: int, datos: dict) -> {d.clase} | None:
        """Sin filtro de dueño. El servicio ya comprobó que quien pide es admin."""
        row = self._s.query({d.clase}Model).filter({d.clase}Model.id == registro_id).first()
        if row is None:
            return None
{asignaciones}
        self._s.commit()
        self._s.refresh(row)
        return _a_entidad(row)

    def delete_any(self, registro_id: int) -> bool:
        """Sin filtro de dueño. El servicio ya comprobó que quien pide es admin."""
        row = self._s.query({d.clase}Model).filter({d.clase}Model.id == registro_id).first()
        if row is None:
            return False
        self._s.delete(row)
        self._s.commit()
        return True

    def _buscar(self, registro_id: int, owner_id: int):
        return (
            self._s.query({d.clase}Model)
            .filter({d.clase}Model.id == registro_id, {d.clase}Model.owner_id == owner_id)
            .first()
        )


class SqlCatalogoRepository(CatalogoRepository):
    """Un solo adaptador para todos los catálogos, guiado por estos mapas."""

    _MODELOS = {{{modelos_cat}}}
    _COLUMNAS = {{{columnas_cat}}}
    #: La columna que hace de NOMBRE del ítem (la que ven los desplegables).
    _VISIBLE = {{{visibles_cat}}}

    def __init__(self, session: Session) -> None:
        self._s = session

    def listar(self, slug: str) -> list[dict]:
        modelo = self._MODELOS.get(slug)
        if modelo is None:
            return []
        filas = self._s.query(modelo).order_by(modelo.id).all()
        columnas = self._COLUMNAS[slug]
        return [
            {{"id": f.id, **{{col: getattr(f, col) for col in columnas}}}}
            for f in filas
        ]

    def crear(self, slug: str, datos: dict) -> dict:
        modelo = self._MODELOS[slug]
        columnas = self._COLUMNAS[slug]
        row = modelo(**{{col: datos.get(col) for col in columnas}})
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return {{"id": row.id, **{{col: getattr(row, col) for col in columnas}}}}

    def borrar(self, slug: str, item_id: int) -> bool:
        modelo = self._MODELOS.get(slug)
        if modelo is None:
            return False
        row = self._s.query(modelo).filter(modelo.id == item_id).first()
        if row is None:
            return False
        self._s.delete(row)
        self._s.commit()
        return True

    def existe_valor(self, slug: str, valor: str) -> bool:
        modelo = self._MODELOS.get(slug)
        if modelo is None:
            return False
        visible = getattr(modelo, self._VISIBLE[slug])
        return self._s.query(modelo).filter(visible == valor).first() is not None
'''


def _web(d: DominioApp) -> str:
    campos_in = "\n".join(f"    {c.nombre}: {_tipo_py(c)}" + ("" if c.obligatorio else " = None") for c in d.campos)
    campos_out = "\n".join(f"    {c.nombre}: {_PYTHON[c.tipo]} | None = None" for c in d.campos)
    a_salida = ", ".join(f"{c.nombre}=r.{c.nombre}" for c in d.campos)
    return f'''"""Entrypoint HTTP: traduce peticiones en llamadas a los casos de uso."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.application.services import (
    AuthError, AuthService, CatalogoService, PermisoError, ValidacionError, {d.clase}Service,
)
from backend.domain.entities import User
from backend.infrastructure.db import SessionLocal
from backend.infrastructure.repositories import (
    SqlCatalogoRepository, SqlUserRepository, Sql{d.clase}Repository,
)
from backend.infrastructure.security import BcryptHasher, JwtTokenService

router = APIRouter(prefix="/api")
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/login")


class Credentials(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    es_admin: bool = False


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegistroIn(BaseModel):
{campos_in}


class RegistroOut(BaseModel):
    id: int
{campos_out}
    #: Solo en la vista del administrador: de quién es cada registro.
    dueno: str | None = None


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_auth(session: Session = Depends(get_session)) -> AuthService:
    return AuthService(SqlUserRepository(session), BcryptHasher(), JwtTokenService())


def get_servicio(session: Session = Depends(get_session)) -> {d.clase}Service:
    return {d.clase}Service(Sql{d.clase}Repository(session), SqlCatalogoRepository(session))


def get_catalogos(session: Session = Depends(get_session)) -> CatalogoService:
    return CatalogoService(SqlCatalogoRepository(session))


def current_user(token: str = Depends(_oauth2), auth: AuthService = Depends(get_auth)) -> User:
    user = auth.user_from_token(token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")
    return user


@router.post("/register", response_model=UserOut)
def register(body: Credentials, auth: AuthService = Depends(get_auth)):
    try:
        user = auth.register(body.username, body.password)
    except (ValidacionError, AuthError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return UserOut(id=user.id, username=user.username)


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), auth: AuthService = Depends(get_auth)):
    try:
        return Token(access_token=auth.login(form.username, form.password))
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@router.get("/me", response_model=UserOut)
def quien_soy(user: User = Depends(current_user)):
    """El frontend decide con esto si muestra el panel de administración."""
    return UserOut(id=user.id or 0, username=user.username, es_admin=user.es_admin)


@router.get("/catalogos")
def ver_catalogos(user: User = Depends(current_user), svc: CatalogoService = Depends(get_catalogos)):
    """Todos los catálogos con sus ítems: alimenta los desplegables del formulario."""
    return svc.listar_todos()


@router.post("/catalogos/{{slug}}")
def crear_en_catalogo(slug: str, body: dict, user: User = Depends(current_user),
                      svc: CatalogoService = Depends(get_catalogos)):
    try:
        return svc.crear(user, slug, body)
    except PermisoError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValidacionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/catalogos/{{slug}}/{{item_id}}")
def borrar_de_catalogo(slug: str, item_id: int, user: User = Depends(current_user),
                       svc: CatalogoService = Depends(get_catalogos)):
    try:
        if not svc.borrar(user, slug, item_id):
            raise HTTPException(status_code=404, detail="No encontrado")
    except PermisoError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValidacionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {{"ok": True}}


@router.get("/registros", response_model=list[RegistroOut])
def listar(user: User = Depends(current_user), svc: {d.clase}Service = Depends(get_servicio)):
    return [
        RegistroOut(id=r.id, {a_salida}, dueno=dueno)
        for r, dueno in svc.list_para(user)
    ]


@router.post("/registros", response_model=RegistroOut)
def crear(body: RegistroIn, user: User = Depends(current_user),
          svc: {d.clase}Service = Depends(get_servicio)):
    try:
        r = svc.create(user.id, body.model_dump())
    except ValidacionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return RegistroOut(id=r.id, {a_salida})


@router.put("/registros/{{registro_id}}", response_model=RegistroOut)
def actualizar(registro_id: int, body: RegistroIn, user: User = Depends(current_user),
               svc: {d.clase}Service = Depends(get_servicio)):
    try:
        # El admin corrige el de cualquiera; los demás, solo el suyo.
        r = svc.update_como(user, registro_id, body.model_dump())
    except ValidacionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if r is None:
        raise HTTPException(status_code=404, detail="No encontrado")
    return RegistroOut(id=r.id, {a_salida})


@router.delete("/registros/{{registro_id}}")
def borrar(registro_id: int, user: User = Depends(current_user),
           svc: {d.clase}Service = Depends(get_servicio)):
    # El administrador puede cancelar el registro de cualquiera (la dueña
    # cancela citas); los demás solo el suyo.
    if not svc.delete_como(user, registro_id):
        raise HTTPException(status_code=404, detail="No encontrado")
    return {{"ok": True}}


@router.get("/resumen")
def resumen(user: User = Depends(current_user), svc: {d.clase}Service = Depends(get_servicio)):
    """Los cálculos declarados en el dominio, sobre lo que este usuario ve."""
    return svc.resumen_para(user)
'''


def _main() -> str:
    return '''"""Composition root: arma la app, crea tablas y sirve el frontend."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.infrastructure.db import create_tables, sembrar_demostracion
from backend.infrastructure.security import BcryptHasher
from backend.infrastructure.web import router

create_tables()
# Datos de ejemplo la primera vez: quien reciba el enlace ve un sistema EN USO,
# con números de verdad en el resumen, en vez de una pantalla en blanco.
sembrar_demostracion(BcryptHasher())

app = FastAPI(title="MVP")
app.include_router(router)

_FRONT = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_FRONT / "index.html"))


# La PWA exige que el manifest y el service worker se sirvan desde la RAÍZ:
# el alcance de un service worker es la carpeta desde la que se sirve, y desde
# /static no podría controlar la página.
@app.get("/manifest.json")
def manifest():
    return FileResponse(str(_FRONT / "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(str(_FRONT / "sw.js"), media_type="text/javascript")
'''


# ---------------------------------------------------------------------------
# FRONTEND — el formulario y la lista se dibujan según el dominio
# ---------------------------------------------------------------------------
_PALETAS = {
    "cálido": ("#2A1D16", "#F3EADE", "#B4682B", "#2B211B", "#6B5647", "#D6C4AE"),
    "calido": ("#2A1D16", "#F3EADE", "#B4682B", "#2B211B", "#6B5647", "#D6C4AE"),
    "frío":   ("#0C1622", "#EEF3F7", "#1C6E8C", "#16232E", "#5A6B78", "#CBD8E2"),
    "frio":   ("#0C1622", "#EEF3F7", "#1C6E8C", "#16232E", "#5A6B78", "#CBD8E2"),
    "sobrio": ("#1A1A1A", "#F4F4F2", "#4A4A48", "#1F1F1E", "#63635F", "#D8D8D3"),
    "vivo":   ("#1A0F2E", "#F6F1FB", "#7A3FBF", "#241635", "#6B5E7D", "#DCCFE9"),
    "neutro": ("#111827", "#F7F8FA", "#3B4CCA", "#16202B", "#55636F", "#DDE3EA"),
}


def _campos_js(d: DominioApp) -> str:
    """Descripción de los campos que consume el frontend para dibujarse."""
    salida = []
    for c in d.campos:
        salida.append({
            "nombre": c.nombre,
            "etiqueta": c.etiqueta,
            "tipo": c.tipo,
            "obligatorio": c.obligatorio,
            "opciones": c.opciones,
            "minimo": c.minimo,
            "maximo": c.maximo,
            "ayuda": c.ayuda,
        })
    return json.dumps(salida, ensure_ascii=False).replace("</", r"<\/")


def _index_html(d: DominioApp) -> str:
    datos = json.dumps(
        {"name": d.app_name, "entidad": d.entidad, "plural": d.entidad_plural},
        ensure_ascii=False,
    ).replace("</", r"<\/")
    return f'''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(d.app_name)}</title>
  <link rel="stylesheet" href="static/styles.css">
</head>
<body>
  <main id="app" class="wrap"></main>
  <script type="module">
    window.__APP__ = {datos};
    window.__CAMPOS__ = {_campos_js(d)};
  </script>
  <script type="module" src="static/js/app.js"></script>
</body>
</html>
'''


