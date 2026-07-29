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
    "texto": "String",
    "texto_largo": "Text",
    "entero": "Integer",
    "decimal": "Float",
    "fecha": "String",   # ISO: simple, ordenable y sin líos de zona horaria
    "opcion": "String",
    "booleano": "Boolean",
}
_PYTHON = {
    "texto": "str",
    "texto_largo": "str",
    "entero": "int",
    "decimal": "float",
    "fecha": "str",
    "opcion": "str",
    "booleano": "bool",
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
    def create(self, owner_id: int, datos: dict) -> {d.clase}: ...
    @abstractmethod
    def get(self, registro_id: int, owner_id: int) -> {d.clase} | None: ...
    @abstractmethod
    def update(self, registro_id: int, owner_id: int, datos: dict) -> {d.clase} | None: ...
    @abstractmethod
    def delete(self, registro_id: int, owner_id: int) -> bool: ...


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

    return f'''"""Casos de uso: dependen SOLO de puertos."""
from __future__ import annotations

import re

from backend.domain.entities import {d.clase}, User
from backend.domain.ports import (
    PasswordHasher,
    TokenService,
    UserRepository,
    {d.clase}Repository,
)


class AuthError(Exception):
    """Credenciales inválidas o usuario ya existente."""


class ValidacionError(Exception):
    """Los datos recibidos no cumplen las reglas del dominio."""


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


class {d.clase}Service:
    def __init__(self, repo: {d.clase}Repository) -> None:
        self._repo = repo

    def list(self, owner_id: int) -> list[{d.clase}]:
        return self._repo.list_for(owner_id)

    def create(self, owner_id: int, datos: dict) -> {d.clase}:
        return self._repo.create(owner_id, validar_{d.tabla}(datos))

    def update(self, registro_id: int, owner_id: int, datos: dict) -> {d.clase} | None:
        return self._repo.update(registro_id, owner_id, validar_{d.tabla}(datos))

    def delete(self, registro_id: int, owner_id: int) -> bool:
        return self._repo.delete(registro_id, owner_id)

    def resumen(self, owner_id: int) -> dict:
        """Los números que acompañan a la lista: es lo que la vuelve informativa."""
        registros = self._repo.list_for(owner_id)
        resultado: dict = {{}}
{bloque_calculos}
        return resultado
'''


def _db(d: DominioApp) -> str:
    columnas = []
    for c in d.campos:
        tipo = _COLUMNA[c.tipo]
        nulo = "False" if c.obligatorio else "True"
        extra = ", default=False" if c.tipo == "booleano" else ""
        columnas.append(f"    {c.nombre} = Column({tipo}, nullable={nulo}{extra})")
    return f'''"""Infraestructura: base de datos y modelos ORM."""
from __future__ import annotations

from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text, create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

engine = create_engine("sqlite:///./app.db", connect_args={{"check_same_thread": False}})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)


class {d.clase}Model(Base):
    __tablename__ = "{d.tabla}"
    id = Column(Integer, primary_key=True, index=True)
{chr(10).join(columnas)}
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
'''


def _repositories(d: DominioApp) -> str:
    campos = ", ".join(f"{c.nombre}=row.{c.nombre}" for c in d.campos)
    asignaciones = "\n".join(
        f"        if {c.nombre!r} in datos:\n            row.{c.nombre} = datos[{c.nombre!r}]"
        for c in d.campos
    )
    creacion = ", ".join(f"{c.nombre}=datos.get({c.nombre!r})" for c in d.campos)
    return f'''"""Adaptadores: implementan los puertos con SQLAlchemy."""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.domain.entities import {d.clase}, User
from backend.domain.ports import UserRepository, {d.clase}Repository
from backend.infrastructure.db import UserModel, {d.clase}Model


def _a_user(row: UserModel) -> User:
    return User(id=row.id, username=row.username)


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

    def _buscar(self, registro_id: int, owner_id: int):
        return (
            self._s.query({d.clase}Model)
            .filter({d.clase}Model.id == registro_id, {d.clase}Model.owner_id == owner_id)
            .first()
        )
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
    AuthError, AuthService, ValidacionError, {d.clase}Service,
)
from backend.domain.entities import User
from backend.infrastructure.db import SessionLocal
from backend.infrastructure.repositories import SqlUserRepository, Sql{d.clase}Repository
from backend.infrastructure.security import BcryptHasher, JwtTokenService

router = APIRouter(prefix="/api")
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/login")


class Credentials(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegistroIn(BaseModel):
{campos_in}


class RegistroOut(BaseModel):
    id: int
{campos_out}


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_auth(session: Session = Depends(get_session)) -> AuthService:
    return AuthService(SqlUserRepository(session), BcryptHasher(), JwtTokenService())


def get_servicio(session: Session = Depends(get_session)) -> {d.clase}Service:
    return {d.clase}Service(Sql{d.clase}Repository(session))


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


@router.get("/registros", response_model=list[RegistroOut])
def listar(user: User = Depends(current_user), svc: {d.clase}Service = Depends(get_servicio)):
    return [RegistroOut(id=r.id, {a_salida}) for r in svc.list(user.id)]


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
        r = svc.update(registro_id, user.id, body.model_dump())
    except ValidacionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if r is None:
        raise HTTPException(status_code=404, detail="No encontrado")
    return RegistroOut(id=r.id, {a_salida})


@router.delete("/registros/{{registro_id}}")
def borrar(registro_id: int, user: User = Depends(current_user),
           svc: {d.clase}Service = Depends(get_servicio)):
    if not svc.delete(registro_id, user.id):
        raise HTTPException(status_code=404, detail="No encontrado")
    return {{"ok": True}}


@router.get("/resumen")
def resumen(user: User = Depends(current_user), svc: {d.clase}Service = Depends(get_servicio)):
    """Los cálculos declarados en el dominio (totales, promedios, conteos)."""
    return svc.resumen(user.id)
'''


def _main() -> str:
    return '''"""Composition root: arma la app, crea tablas y sirve el frontend."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.infrastructure.db import create_tables
from backend.infrastructure.web import router

create_tables()

app = FastAPI(title="MVP")
app.include_router(router)

_FRONT = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_FRONT / "index.html"))
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


def _styles(d: DominioApp) -> str:
    fondo, papel, acento, tinta, tinta2, linea = _PALETAS.get(d.tono.lower(), _PALETAS["neutro"])
    return f'''/* {d.app_name} — la paleta responde al dominio, no es una plantilla única. */
*{{box-sizing:border-box}}
:root{{
  --fondo:{fondo}; --papel:{papel}; --acento:{acento};
  --tinta:{tinta}; --tinta-2:{tinta2}; --linea:{linea};
  --ok:#2F7D51; --alerta:#B4541F;
}}
body{{margin:0;min-height:100vh;display:grid;place-items:start center;padding:1.5rem;
  background:linear-gradient(165deg,var(--fondo),#0B0B0F);color:var(--tinta);
  font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;line-height:1.6}}
.wrap{{width:100%;max-width:680px;padding-block:1.5rem}}
.card{{background:var(--papel);border-radius:6px;padding:1.9rem;
  box-shadow:0 24px 56px -22px rgba(0,0,0,.6)}}
h1{{margin:0 0 .2rem;font-size:1.6rem;letter-spacing:-.01em;text-wrap:balance}}
.sub{{margin:0 0 1.4rem;color:var(--tinta-2);font-size:.94rem}}

label{{display:block;font-size:.82rem;font-weight:600;color:var(--tinta);margin:.7rem 0 .25rem}}
label .req{{color:var(--alerta)}}
input,select,textarea{{width:100%;padding:.65rem .8rem;border:1px solid var(--linea);
  border-radius:4px;background:#fff;color:var(--tinta);font-size:.98rem;font-family:inherit}}
textarea{{min-height:80px;resize:vertical}}
input[type=checkbox]{{width:auto;margin-right:.5rem}}
input:focus,select:focus,textarea:focus{{outline:none;border-color:var(--acento);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--acento) 18%,transparent)}}
.ayuda{{font-size:.76rem;color:var(--tinta-2);margin:.2rem 0 0}}

button{{padding:.68rem 1.15rem;border:0;border-radius:4px;background:var(--acento);
  color:#fff;font-weight:600;font-size:.95rem;cursor:pointer;font-family:inherit}}
button:hover{{filter:brightness(1.08)}}
button.ghost{{background:transparent;border:1px solid var(--linea);color:var(--tinta-2)}}
button.small{{padding:.35rem .7rem;font-size:.82rem}}
.row{{display:flex;gap:.6rem;margin-top:1rem}}
.row button{{flex:1}}

.msg{{font-size:.88rem;margin:.9rem 0 0;min-height:1.1em;color:var(--tinta-2)}}
.msg.ok{{color:var(--ok)}}
.msg.error{{color:var(--alerta)}}

.cab{{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;
  margin-bottom:1.1rem;padding-bottom:.8rem;border-bottom:2px solid var(--tinta)}}

/* Cálculos: lo que convierte una lista en un sistema de información */
.resumen{{display:flex;flex-wrap:wrap;gap:.7rem;margin-bottom:1.2rem}}
.dato{{flex:1;min-width:120px;background:color-mix(in srgb,var(--acento) 8%,transparent);
  border:1px solid var(--linea);border-radius:4px;padding:.6rem .8rem}}
.dato .v{{font-size:1.3rem;font-weight:700;font-variant-numeric:tabular-nums;color:var(--acento)}}
.dato .e{{font-size:.72rem;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.06em}}

.lista{{list-style:none;margin:1.2rem 0 0;padding:0;display:flex;flex-direction:column;gap:.6rem}}
.item{{background:#fff;border:1px solid var(--linea);border-left:3px solid var(--acento);
  border-radius:4px;padding:.8rem .9rem;display:flex;gap:.8rem;align-items:flex-start}}
.item .datos{{flex:1;display:grid;gap:.15rem;min-width:0}}
.item .par{{font-size:.9rem}}
.item .par b{{color:var(--tinta-2);font-weight:600;font-size:.78rem;
  text-transform:uppercase;letter-spacing:.04em;margin-right:.4rem}}
.item .num{{font-variant-numeric:tabular-nums}}
.item .del{{background:transparent;border:0;color:var(--tinta-2);font-size:1.05rem;
  cursor:pointer;padding:.1rem .35rem;border-radius:3px}}
.item .del:hover{{color:var(--alerta);background:color-mix(in srgb,var(--alerta) 10%,transparent)}}

.vacio{{text-align:center;padding:1.8rem 1rem;color:var(--tinta-2);font-size:.92rem;
  border:1px dashed var(--linea);border-radius:4px}}

@media (max-width:480px){{
  .card{{padding:1.4rem 1.15rem}}
  .row{{flex-direction:column}}
}}
@media (prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
'''
