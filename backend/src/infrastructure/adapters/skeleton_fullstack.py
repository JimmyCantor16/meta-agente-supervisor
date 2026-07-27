"""Esqueleto full-stack + login PROBADO, correcto por construcción.

La lección de 4 generaciones libres: el LLM rompe SIEMPRE en la plomería
(cableado de routers, colisiones modelo/schema, imports, pines, plantillas). La
forma adecuada de "garantizar un MVP" no es re-generar esa plomería y parchearla,
sino REUTILIZAR una que ya funciona y dejar que el modelo solo ponga el dominio.

Aquí el backend es SIEMPRE idéntico (FastAPI + SQLite + JWT + CRUD de una entidad
`Item`, rutas `/api/...` fijas, sin colisiones de nombres, `bcrypt` pineado, JS en
un solo archivo sin imports ES). Solo se parametrizan los TEXTOS visibles (nombre
de la app y qué representa el item). Al no tocar el código, no puede romperse: pasa
la verificación al intento 1 y entrega URL.
"""

from __future__ import annotations

from src.domain.entities import GeneratedFile, GeneratedProject

# Marcador oculto: permite al generador saber que un proyecto salió del esqueleto
# (correcto por construcción) y NO pasarlo por el reparador del LLM.
MARCADOR = "backend/.esqueleto"


def _requirements() -> str:
    # bcrypt pineado a la última versión compatible con passlib (evita el 500 de
    # "password cannot be longer than 72 bytes" de bcrypt>=4.1).
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


def _database() -> str:
    return '''from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
'''


def _models() -> str:
    return '''from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from backend.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    items = relationship("Item", back_populates="owner", cascade="all, delete-orphan")


class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    done = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="items")
'''


def _schemas() -> str:
    # Nombres SIN colisión con los modelos ORM (UserOut, ItemOut, no "User"/"Item").
    return '''from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ItemCreate(BaseModel):
    text: str


class ItemOut(BaseModel):
    id: int
    text: str
    done: bool
    created_at: datetime | None = None

    class Config:
        from_attributes = True
'''


def _auth() -> str:
    return '''from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models

SECRET_KEY = "cambia-esta-clave-en-produccion-por-una-larga-y-secreta"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(sub: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": sub, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar la credencial",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise creds_exc
    except JWTError:
        raise creds_exc
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise creds_exc
    return user
'''


def _router_auth() -> str:
    return '''from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas, auth

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    db_user = models.User(username=user.username, hashed_password=auth.hash_password(user.password))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form.username).first()
    if not user or not auth.verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    return schemas.Token(access_token=auth.create_access_token(user.username))
'''


def _router_items() -> str:
    return '''from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas
from backend.auth import get_current_user

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("", response_model=list[schemas.ItemOut])
def list_items(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Item).filter(models.Item.owner_id == user.id).order_by(models.Item.id.desc()).all()


@router.post("", response_model=schemas.ItemOut)
def create_item(item: schemas.ItemCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    db_item = models.Item(text=item.text, owner_id=user.id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.post("/{item_id}/toggle", response_model=schemas.ItemOut)
def toggle_item(item_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.owner_id == user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="No encontrado")
    item.done = not item.done
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.owner_id == user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.delete(item)
    db.commit()
    return {"ok": True}
'''


def _main() -> str:
    return '''from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.database import Base, engine
from backend.routers import auth as auth_router
from backend.routers import items as items_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MVP")

_FRONT = Path(__file__).resolve().parent.parent / "frontend"

app.include_router(auth_router.router)
app.include_router(items_router.router)

app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/")
def root():
    return FileResponse(str(_FRONT / "index.html"))
'''


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
  <main id="app" class="wrap">
    <section id="auth" class="card">
      <h1>{app_name}</h1>
      <p class="sub">Entra o crea tu cuenta para ver {item_label}.</p>
      <input id="u" placeholder="Usuario" autocomplete="username">
      <input id="p" type="password" placeholder="Contraseña" autocomplete="current-password">
      <div class="row">
        <button id="btn-login">Entrar</button>
        <button id="btn-register" class="ghost">Crear cuenta</button>
      </div>
      <p id="auth-msg" class="msg"></p>
    </section>

    <section id="board" class="card hidden">
      <div class="board-head">
        <h1>{app_name}</h1>
        <button id="btn-logout" class="ghost small">Salir</button>
      </div>
      <form id="add-form" class="add">
        <input id="new-item" placeholder="{field_ph}" autocomplete="off">
        <button type="submit">Agregar</button>
      </form>
      <ul id="list" class="list"></ul>
      <p id="empty" class="msg">Aún no hay {item_label}.</p>
    </section>
  </main>
  <script src="/static/app.js"></script>
</body>
</html>
'''


def _styles() -> str:
    return '''*{box-sizing:border-box}
:root{--bg:#0f172a;--card:#1e293b;--ink:#e2e8f0;--mut:#94a3b8;--acc:#6366f1;--line:#334155;--ok:#10b981}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#0f172a,#1e1b4b);
  color:var(--ink);font-family:'Segoe UI',system-ui,sans-serif;padding:1.5rem}
.wrap{width:100%;max-width:460px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:1.8rem;
  box-shadow:0 24px 60px -24px rgba(0,0,0,.6)}
.hidden{display:none}
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
.item{display:flex;align-items:center;gap:.7rem;padding:.7rem .9rem;background:#0f172a;border:1px solid var(--line);
  border-radius:10px}
.item.done .txt{text-decoration:line-through;color:var(--mut)}
.item .txt{flex:1}
.item .chk{width:20px;height:20px;cursor:pointer;accent-color:var(--ok)}
.item .del{background:transparent;color:#f87171;border:0;font-size:1.1rem;cursor:pointer;padding:.1rem .4rem}
'''


def _app_js() -> str:
    # UN SOLO archivo, SIN imports ES (no puede fallar por "type=module"). Fetch
    # SIEMPRE con rutas relativas /api/... (funciona igual en local y en Render).
    return r'''const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("token") || "";

function show(logged) {
  $("auth").classList.toggle("hidden", logged);
  $("board").classList.toggle("hidden", !logged);
}

async function api(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  return res;
}

async function register() {
  const r = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({ username: $("u").value, password: $("p").value }),
  });
  if (r.ok) { $("auth-msg").textContent = "Cuenta creada. Ahora entra."; }
  else { const d = await r.json().catch(() => ({})); $("auth-msg").textContent = d.detail || "No se pudo registrar."; }
}

async function login() {
  const body = new URLSearchParams();
  body.set("username", $("u").value);
  body.set("password", $("p").value);
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (r.ok) {
    const d = await r.json();
    token = d.access_token;
    localStorage.setItem("token", token);
    show(true);
    load();
  } else {
    $("auth-msg").textContent = "Usuario o contraseña incorrectos.";
  }
}

function logout() {
  token = "";
  localStorage.removeItem("token");
  show(false);
}

async function load() {
  const r = await api("/api/items");
  if (r.status === 401) { logout(); return; }
  const items = await r.json();
  const list = $("list");
  list.innerHTML = "";
  $("empty").style.display = items.length ? "none" : "block";
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "item" + (it.done ? " done" : "");
    const chk = document.createElement("input");
    chk.type = "checkbox"; chk.className = "chk"; chk.checked = it.done;
    chk.onclick = async () => { await api("/api/items/" + it.id + "/toggle", { method: "POST" }); load(); };
    const span = document.createElement("span");
    span.className = "txt"; span.textContent = it.text;
    const del = document.createElement("button");
    del.className = "del"; del.textContent = "✕";
    del.onclick = async () => { await api("/api/items/" + it.id, { method: "DELETE" }); load(); };
    li.append(chk, span, del);
    list.appendChild(li);
  }
}

$("btn-login").onclick = login;
$("btn-register").onclick = register;
$("btn-logout").onclick = logout;
$("add-form").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("new-item").value.trim();
  if (!text) return;
  await api("/api/items", { method: "POST", body: JSON.stringify({ text }) });
  $("new-item").value = "";
  load();
};

if (token) { show(true); load(); } else { show(false); }
'''


def _readme(app_name: str) -> str:
    return f"# {app_name}\n\nApp full-stack (FastAPI + SQLite) con login y CRUD.\n\n## Correr\n\n```\npip install -r backend/requirements.txt\nuvicorn backend.main:app --reload\n```\n\nAbre http://localhost:8000\n"


def _manual(app_name: str, item_label: str) -> str:
    return (
        f"# Manual de {app_name}\n\n"
        f"1. Abre la URL.\n2. Crea una cuenta (usuario y contraseña) y entra.\n"
        f"3. Agrega {item_label}, márcalos como hechos o bórralos.\n"
        f"Cada usuario ve solo sus propios {item_label}.\n"
    )


def construir(app_name: str, item_label: str, field_ph: str) -> GeneratedProject:
    """Devuelve un proyecto full-stack + login COMPLETO y correcto.

    app_name: título visible (p. ej. "Lista de Tareas").
    item_label: qué son los ítems en plural (p. ej. "tareas", "notas").
    field_ph: placeholder del campo de texto (p. ej. "Escribe una tarea...").
    """
    app_name = (app_name or "Mi App").strip()[:60]
    item_label = (item_label or "elementos").strip()[:40]
    field_ph = (field_ph or "Escribe algo...").strip()[:60]

    archivos = {
        "backend/requirements.txt": _requirements(),
        "backend/__init__.py": "",
        "backend/database.py": _database(),
        "backend/models.py": _models(),
        "backend/schemas.py": _schemas(),
        "backend/auth.py": _auth(),
        "backend/routers/__init__.py": "",
        "backend/routers/auth.py": _router_auth(),
        "backend/routers/items.py": _router_items(),
        "backend/main.py": _main(),
        "frontend/index.html": _index_html(app_name, item_label, field_ph),
        "frontend/styles.css": _styles(),
        "frontend/app.js": _app_js(),
        "README.md": _readme(app_name),
        "MANUAL.md": _manual(app_name, item_label),
        MARCADOR: "esqueleto full-stack v1",
    }
    files = [GeneratedFile(path=p, content=c) for p, c in archivos.items()]
    return GeneratedProject(
        name=app_name,
        summary=f"App full-stack con login y CRUD de {item_label} (FastAPI + SQLite).",
        files=files,
        run_instructions="pip install -r backend/requirements.txt && uvicorn backend.main:app",
    )
