"""Esqueleto full-stack + login PROBADO — backend HEXAGONAL + frontend POR COMPONENTES.

La lección de las generaciones libres: el LLM rompe SIEMPRE en la plomería. La
forma adecuada de garantizar un MVP no es re-generar esa plomería, sino
REUTILIZAR una que ya funciona y que además esté BIEN ESTRUCTURADA para escalar.

Este esqueleto entrega:
  - Backend HEXAGONAL (domain / application / infrastructure): el dominio no sabe
    de FastAPI ni de SQLAlchemy; los casos de uso dependen de PUERTOS; los
    adaptadores concretos se inyectan en el composition root (main.py).
  - Frontend POR COMPONENTES (módulos ES sin build): api, estado y componentes
    separados, cargados con <script type="module">. Rutas de API SIEMPRE
    RELATIVAS (/api/...): funciona igual en localhost y en producción, sin URLs
    fijas. El backend sirve el front, así que un solo servicio despliega todo.

Solo se parametrizan los TEXTOS visibles. El código no cambia entre generaciones
-> no puede romperse: pasa la verificación al intento 1 y entrega URL.
"""

from __future__ import annotations

from src.domain.entities import GeneratedFile, GeneratedProject

# Marcador oculto: el generador sabe que el proyecto salió del esqueleto
# (correcto por construcción) y NO lo pasa por el reparador del LLM.
MARCADOR = "backend/.esqueleto"


# ---------------------------------------------------------------------------
# BACKEND — arquitectura hexagonal
# ---------------------------------------------------------------------------
def _requirements() -> str:
    # bcrypt pineado a la última versión compatible con passlib.
    return (
        "fastapi==0.111.0\n"
        "uvicorn==0.30.1\n"
        "sqlalchemy==2.0.30\n"
        "pydantic==2.7.4\n"
        "passlib==1.7.4\n"
        "bcrypt==4.0.1\n"
        "python-jose==3.3.0\n"
        "python-multipart==0.0.9\n"
    )


def _domain_entities() -> str:
    return '''"""Dominio: entidades puras. NO importan FastAPI ni SQLAlchemy."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class User:
    id: int | None
    username: str


@dataclass
class Item:
    id: int | None
    text: str
    done: bool
    owner_id: int
'''


def _domain_ports() -> str:
    return '''"""Puertos: contratos que la aplicación necesita. Los implementa infraestructura."""
from __future__ import annotations

from abc import ABC, abstractmethod

from .entities import Item, User


class UserRepository(ABC):
    @abstractmethod
    def by_username(self, username: str) -> User | None: ...
    @abstractmethod
    def create(self, username: str, hashed_password: str) -> User: ...
    @abstractmethod
    def hashed_password(self, username: str) -> str | None: ...


class ItemRepository(ABC):
    @abstractmethod
    def list_for(self, owner_id: int) -> list[Item]: ...
    @abstractmethod
    def create(self, owner_id: int, text: str) -> Item: ...
    @abstractmethod
    def get(self, item_id: int, owner_id: int) -> Item | None: ...
    @abstractmethod
    def set_done(self, item_id: int, owner_id: int, done: bool) -> Item | None: ...
    @abstractmethod
    def delete(self, item_id: int, owner_id: int) -> bool: ...


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


def _application_services() -> str:
    return '''"""Casos de uso: dependen SOLO de puertos (inyección por constructor)."""
from __future__ import annotations

from backend.domain.entities import Item, User
from backend.domain.ports import ItemRepository, PasswordHasher, TokenService, UserRepository


class AuthError(Exception):
    """Credenciales inválidas o usuario ya existente."""


class AuthService:
    def __init__(self, users: UserRepository, hasher: PasswordHasher, tokens: TokenService) -> None:
        self._users = users
        self._hasher = hasher
        self._tokens = tokens

    def register(self, username: str, password: str) -> User:
        if self._users.by_username(username):
            raise AuthError("El usuario ya existe")
        return self._users.create(username, self._hasher.hash(password))

    def login(self, username: str, password: str) -> str:
        hashed = self._users.hashed_password(username)
        if not hashed or not self._hasher.verify(password, hashed):
            raise AuthError("Usuario o contraseña incorrectos")
        return self._tokens.issue(username)

    def user_from_token(self, token: str) -> User | None:
        username = self._tokens.username_from(token)
        return self._users.by_username(username) if username else None


class ItemService:
    def __init__(self, items: ItemRepository) -> None:
        self._items = items

    def list(self, owner_id: int) -> list[Item]:
        return self._items.list_for(owner_id)

    def create(self, owner_id: int, text: str) -> Item:
        return self._items.create(owner_id, text.strip())

    def toggle(self, item_id: int, owner_id: int) -> Item | None:
        current = self._items.get(item_id, owner_id)
        if current is None:
            return None
        return self._items.set_done(item_id, owner_id, not current.done)

    def delete(self, item_id: int, owner_id: int) -> bool:
        return self._items.delete(item_id, owner_id)
'''


def _infra_db() -> str:
    return '''"""Infraestructura: base de datos (SQLAlchemy) + modelos ORM."""
from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

engine = create_engine("sqlite:///./app.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)


class ItemModel(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    done = Column(Boolean, default=False, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
'''


def _infra_repositories() -> str:
    return '''"""Adaptadores: implementan los puertos del dominio con SQLAlchemy."""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.domain.entities import Item, User
from backend.domain.ports import ItemRepository, UserRepository
from backend.infrastructure.db import ItemModel, UserModel


def _to_user(row: UserModel) -> User:
    return User(id=row.id, username=row.username)


def _to_item(row: ItemModel) -> Item:
    return Item(id=row.id, text=row.text, done=row.done, owner_id=row.owner_id)


class SqlUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def by_username(self, username: str) -> User | None:
        row = self._s.query(UserModel).filter(UserModel.username == username).first()
        return _to_user(row) if row else None

    def hashed_password(self, username: str) -> str | None:
        row = self._s.query(UserModel).filter(UserModel.username == username).first()
        return row.hashed_password if row else None

    def create(self, username: str, hashed_password: str) -> User:
        row = UserModel(username=username, hashed_password=hashed_password)
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _to_user(row)


class SqlItemRepository(ItemRepository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def list_for(self, owner_id: int) -> list[Item]:
        rows = (
            self._s.query(ItemModel)
            .filter(ItemModel.owner_id == owner_id)
            .order_by(ItemModel.id.desc())
            .all()
        )
        return [_to_item(r) for r in rows]

    def create(self, owner_id: int, text: str) -> Item:
        row = ItemModel(text=text, done=False, owner_id=owner_id)
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _to_item(row)

    def get(self, item_id: int, owner_id: int) -> Item | None:
        row = self._s.query(ItemModel).filter(ItemModel.id == item_id, ItemModel.owner_id == owner_id).first()
        return _to_item(row) if row else None

    def set_done(self, item_id: int, owner_id: int, done: bool) -> Item | None:
        row = self._s.query(ItemModel).filter(ItemModel.id == item_id, ItemModel.owner_id == owner_id).first()
        if row is None:
            return None
        row.done = done
        self._s.commit()
        self._s.refresh(row)
        return _to_item(row)

    def delete(self, item_id: int, owner_id: int) -> bool:
        row = self._s.query(ItemModel).filter(ItemModel.id == item_id, ItemModel.owner_id == owner_id).first()
        if row is None:
            return False
        self._s.delete(row)
        self._s.commit()
        return True
'''


def _infra_security() -> str:
    return '''"""Adaptadores de seguridad: hashing (bcrypt) y tokens (JWT)."""
from __future__ import annotations

from datetime import datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.domain.ports import PasswordHasher, TokenService

_SECRET = "cambia-esta-clave-en-produccion-por-una-larga-y-secreta"
_ALGO = "HS256"
_EXPIRE_MIN = 60 * 24


class BcryptHasher(PasswordHasher):
    def __init__(self) -> None:
        self._ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    def hash(self, plain: str) -> str:
        return self._ctx.hash(plain)

    def verify(self, plain: str, hashed: str) -> bool:
        return self._ctx.verify(plain, hashed)


class JwtTokenService(TokenService):
    def issue(self, username: str) -> str:
        payload = {"sub": username, "exp": datetime.utcnow() + timedelta(minutes=_EXPIRE_MIN)}
        return jwt.encode(payload, _SECRET, algorithm=_ALGO)

    def username_from(self, token: str) -> str | None:
        try:
            return jwt.decode(token, _SECRET, algorithms=[_ALGO]).get("sub")
        except JWTError:
            return None
'''


def _infra_web() -> str:
    return '''"""Entrypoint HTTP (FastAPI): traduce peticiones en llamadas a los casos de uso.

Resuelve la inyección con Depends: una sesión por petición, y con ella los
repositorios y servicios. El dominio y la aplicación no conocen este módulo.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.application.services import AuthError, AuthService, ItemService
from backend.domain.entities import User
from backend.infrastructure.db import SessionLocal
from backend.infrastructure.repositories import SqlItemRepository, SqlUserRepository
from backend.infrastructure.security import BcryptHasher, JwtTokenService

router = APIRouter(prefix="/api")
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/login")


# --- DTOs ---
class Credentials(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ItemIn(BaseModel):
    text: str


class ItemOut(BaseModel):
    id: int
    text: str
    done: bool


# --- Inyección de dependencias (composition por petición) ---
def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_auth(session: Session = Depends(get_session)) -> AuthService:
    return AuthService(SqlUserRepository(session), BcryptHasher(), JwtTokenService())


def get_items(session: Session = Depends(get_session)) -> ItemService:
    return ItemService(SqlItemRepository(session))


def current_user(token: str = Depends(_oauth2), auth: AuthService = Depends(get_auth)) -> User:
    user = auth.user_from_token(token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")
    return user


# --- Rutas ---
@router.post("/register", response_model=UserOut)
def register(body: Credentials, auth: AuthService = Depends(get_auth)):
    try:
        user = auth.register(body.username, body.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return UserOut(id=user.id, username=user.username)


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), auth: AuthService = Depends(get_auth)):
    try:
        return Token(access_token=auth.login(form.username, form.password))
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@router.get("/items", response_model=list[ItemOut])
def list_items(user: User = Depends(current_user), items: ItemService = Depends(get_items)):
    return [ItemOut(id=i.id, text=i.text, done=i.done) for i in items.list(user.id)]


@router.post("/items", response_model=ItemOut)
def create_item(body: ItemIn, user: User = Depends(current_user), items: ItemService = Depends(get_items)):
    i = items.create(user.id, body.text)
    return ItemOut(id=i.id, text=i.text, done=i.done)


@router.post("/items/{item_id}/toggle", response_model=ItemOut)
def toggle_item(item_id: int, user: User = Depends(current_user), items: ItemService = Depends(get_items)):
    i = items.toggle(item_id, user.id)
    if i is None:
        raise HTTPException(status_code=404, detail="No encontrado")
    return ItemOut(id=i.id, text=i.text, done=i.done)


@router.delete("/items/{item_id}")
def delete_item(item_id: int, user: User = Depends(current_user), items: ItemService = Depends(get_items)):
    if not items.delete(item_id, user.id):
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}
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
# FRONTEND — por componentes (módulos ES, sin build, rutas relativas)
# ---------------------------------------------------------------------------
def _index_html(app_name: str, item_label: str, field_ph: str) -> str:
    return f'''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{app_name}</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <main id="app" class="wrap"></main>
  <script type="module">
    // Textos de la app (los inyecta el generador; el resto del código es fijo).
    window.__APP__ = {{ name: "{app_name}", itemLabel: "{item_label}", fieldPh: "{field_ph}" }};
  </script>
  <script type="module" src="/static/js/app.js"></script>
</body>
</html>
'''


def _js_api() -> str:
    # Cliente HTTP: rutas SIEMPRE relativas (/api/...). Funciona en local y prod.
    return r'''// Cliente de API. Rutas relativas: sirven igual en localhost y en producción.
import { getToken } from "./state.js";

async function req(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(path, Object.assign({}, opts, { headers }));
}

export async function register(username, password) {
  return req("/api/register", { method: "POST", body: JSON.stringify({ username, password }) });
}

export async function login(username, password) {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  return fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function listItems() { return req("/api/items"); }
export async function addItem(text) { return req("/api/items", { method: "POST", body: JSON.stringify({ text }) }); }
export async function toggleItem(id) { return req("/api/items/" + id + "/toggle", { method: "POST" }); }
export async function deleteItem(id) { return req("/api/items/" + id, { method: "DELETE" }); }
'''


def _js_state() -> str:
    return r'''// Estado mínimo: el token de sesión, persistido en el navegador.
let token = localStorage.getItem("token") || "";

export function getToken() { return token; }
export function setToken(t) { token = t; localStorage.setItem("token", t); }
export function clearToken() { token = ""; localStorage.removeItem("token"); }
export function isLogged() { return Boolean(token); }
'''


def _js_component_auth() -> str:
    return r'''// Componente de autenticación: pantalla de entrar / crear cuenta.
import { register, login } from "../api.js";
import { setToken } from "../state.js";

export function AuthView(onLogged) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <h1>${window.__APP__.name}</h1>
    <p class="sub">Entra o crea tu cuenta para ver tus ${window.__APP__.itemLabel}.</p>
    <input class="u" placeholder="Usuario" autocomplete="username">
    <input class="p" type="password" placeholder="Contraseña" autocomplete="current-password">
    <div class="row">
      <button class="in">Entrar</button>
      <button class="up ghost">Crear cuenta</button>
    </div>
    <p class="msg"></p>`;
  const u = el.querySelector(".u"), p = el.querySelector(".p"), msg = el.querySelector(".msg");

  el.querySelector(".up").onclick = async () => {
    const r = await register(u.value, p.value);
    msg.textContent = r.ok ? "Cuenta creada. Ahora entra." : ((await r.json().catch(() => ({}))).detail || "No se pudo registrar.");
  };
  el.querySelector(".in").onclick = async () => {
    const r = await login(u.value, p.value);
    if (r.ok) { setToken((await r.json()).access_token); onLogged(); }
    else { msg.textContent = "Usuario o contraseña incorrectos."; }
  };
  return el;
}
'''


def _js_component_board() -> str:
    return r'''// Componente del tablero: lista los ítems del usuario y permite gestionarlos.
import { listItems, addItem, toggleItem, deleteItem } from "../api.js";
import { clearToken } from "../state.js";

export function BoardView(onLogout) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <div class="board-head">
      <h1>${window.__APP__.name}</h1>
      <button class="out ghost small">Salir</button>
    </div>
    <form class="add">
      <input class="new" placeholder="${window.__APP__.fieldPh}" autocomplete="off">
      <button type="submit">Agregar</button>
    </form>
    <ul class="list"></ul>
    <p class="empty msg">Aún no hay ${window.__APP__.itemLabel}.</p>`;

  const list = el.querySelector(".list"), empty = el.querySelector(".empty");
  const nueva = el.querySelector(".new");

  async function refresh() {
    const r = await listItems();
    if (r.status === 401) { clearToken(); onLogout(); return; }
    const items = await r.json();
    list.innerHTML = "";
    empty.style.display = items.length ? "none" : "block";
    for (const it of items) list.appendChild(row(it, refresh));
  }

  el.querySelector(".out").onclick = () => { clearToken(); onLogout(); };
  el.querySelector(".add").onsubmit = async (e) => {
    e.preventDefault();
    const text = nueva.value.trim();
    if (!text) return;
    await addItem(text);
    nueva.value = "";
    refresh();
  };
  refresh();
  return el;
}

function row(it, refresh) {
  const li = document.createElement("li");
  li.className = "item" + (it.done ? " done" : "");
  const chk = document.createElement("input");
  chk.type = "checkbox"; chk.className = "chk"; chk.checked = it.done;
  chk.onclick = async () => { await toggleItem(it.id); refresh(); };
  const txt = document.createElement("span");
  txt.className = "txt"; txt.textContent = it.text;
  const del = document.createElement("button");
  del.className = "del"; del.textContent = "✕";
  del.onclick = async () => { await deleteItem(it.id); refresh(); };
  li.append(chk, txt, del);
  return li;
}
'''


def _js_app() -> str:
    return r'''// Entrada: monta el componente según haya sesión o no.
import { AuthView } from "./components/auth.js";
import { BoardView } from "./components/board.js";
import { isLogged } from "./state.js";

const root = document.getElementById("app");

function render() {
  root.innerHTML = "";
  root.appendChild(isLogged() ? BoardView(render) : AuthView(render));
}

render();
'''


def _styles() -> str:
    return '''*{box-sizing:border-box}
:root{--bg:#0f172a;--card:#1e293b;--ink:#e2e8f0;--mut:#94a3b8;--acc:#6366f1;--line:#334155;--ok:#10b981}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#0f172a,#1e1b4b);
  color:var(--ink);font-family:'Segoe UI',system-ui,sans-serif;padding:1.5rem}
.wrap{width:100%;max-width:460px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:1.8rem;
  box-shadow:0 24px 60px -24px rgba(0,0,0,.6)}
h1{margin:0 0 .3rem;font-size:1.5rem}
.sub{margin:0 0 1.2rem;color:var(--mut);font-size:.95rem}
input{width:100%;padding:.7rem .9rem;margin-bottom:.7rem;border-radius:10px;border:1px solid var(--line);
  background:#0f172a;color:var(--ink);font-size:1rem}
input:focus{outline:2px solid var(--acc);border-color:transparent}
button{padding:.7rem 1.1rem;border:0;border-radius:10px;background:var(--acc);color:#fff;font-weight:600;
  font-size:.95rem;cursor:pointer}
button:hover{filter:brightness(1.08)}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
button.small{padding:.4rem .8rem;font-size:.85rem}
.row{display:flex;gap:.6rem}
.row button{flex:1}
.msg{color:var(--mut);font-size:.9rem;margin:.8rem 0 0;min-height:1.1em}
.board-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}
.add{display:flex;gap:.6rem;margin-bottom:1rem}
.add input{margin:0}
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.5rem}
.item{display:flex;align-items:center;gap:.7rem;padding:.7rem .9rem;background:#0f172a;border:1px solid var(--line);border-radius:10px}
.item.done .txt{text-decoration:line-through;color:var(--mut)}
.item .txt{flex:1}
.item .chk{width:20px;height:20px;cursor:pointer;accent-color:var(--ok)}
.item .del{background:transparent;color:#f87171;border:0;font-size:1.1rem;cursor:pointer;padding:.1rem .4rem}
'''


def _readme(app_name: str) -> str:
    return (
        f"# {app_name}\n\n"
        "App full-stack con login. Backend **hexagonal** (dominio / aplicación / "
        "infraestructura) y frontend **por componentes** (módulos ES, sin build).\n\n"
        "## Estructura\n\n"
        "```\n"
        "backend/\n"
        "  domain/         # entidades y puertos (no dependen de nada externo)\n"
        "  application/    # casos de uso (dependen de puertos)\n"
        "  infrastructure/ # adaptadores: db, repositorios, seguridad, web (FastAPI)\n"
        "  main.py         # composition root\n"
        "frontend/\n"
        "  js/api.js  js/state.js  js/app.js  js/components/*  styles.css  index.html\n"
        "```\n\n"
        "## Correr\n\n"
        "```\npip install -r backend/requirements.txt\nuvicorn backend.main:app\n```\n\n"
        "Abre http://localhost:8000\n"
    )


def _manual(app_name: str, item_label: str) -> str:
    return (
        f"# Manual de {app_name}\n\n"
        f"1. Abre la URL.\n2. Crea una cuenta y entra.\n"
        f"3. Agrega {item_label}, márcalos como hechos o bórralos.\n"
        f"Cada usuario ve solo sus propios {item_label}.\n"
    )


def construir(app_name: str, item_label: str, field_ph: str) -> GeneratedProject:
    """Devuelve un proyecto full-stack COMPLETO: backend hexagonal + front por componentes."""
    app_name = (app_name or "Mi App").strip()[:60]
    item_label = (item_label or "elementos").strip()[:40]
    field_ph = (field_ph or "Escribe algo...").strip()[:60]

    archivos = {
        "backend/requirements.txt": _requirements(),
        "backend/__init__.py": "",
        "backend/domain/__init__.py": "",
        "backend/domain/entities.py": _domain_entities(),
        "backend/domain/ports.py": _domain_ports(),
        "backend/application/__init__.py": "",
        "backend/application/services.py": _application_services(),
        "backend/infrastructure/__init__.py": "",
        "backend/infrastructure/db.py": _infra_db(),
        "backend/infrastructure/repositories.py": _infra_repositories(),
        "backend/infrastructure/security.py": _infra_security(),
        "backend/infrastructure/web.py": _infra_web(),
        "backend/main.py": _main(),
        "frontend/index.html": _index_html(app_name, item_label, field_ph),
        "frontend/styles.css": _styles(),
        "frontend/js/app.js": _js_app(),
        "frontend/js/api.js": _js_api(),
        "frontend/js/state.js": _js_state(),
        "frontend/js/components/auth.js": _js_component_auth(),
        "frontend/js/components/board.js": _js_component_board(),
        "README.md": _readme(app_name),
        "MANUAL.md": _manual(app_name, item_label),
        MARCADOR: "esqueleto full-stack hexagonal v2",
    }
    files = [GeneratedFile(path=p, content=c) for p, c in archivos.items()]
    return GeneratedProject(
        name=app_name,
        summary=f"App full-stack con login y CRUD de {item_label}. Backend hexagonal + frontend por componentes.",
        files=files,
        run_instructions="pip install -r backend/requirements.txt && uvicorn backend.main:app",
    )
