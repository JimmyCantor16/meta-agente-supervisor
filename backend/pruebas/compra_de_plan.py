"""Prueba: comprar un plan y que el super-admin lo apruebe, de punta a punta.

Recorre las rutas HTTP reales (con un SQLite temporal y usuarios de mentira):

1. Pedir un plan deja la cuenta pendiente con una referencia MA-XXXXXX, el
   importe en USD y las instrucciones de pago; el plan NO se activa todavía.
2. El comprobante se guarda; cancelar retira la solicitud.
3. Aprobar activa el plan (y el cupo pasa a ilimitado); el admin puede
   cambiar el plan al aprobar.
4. Rechazar cierra la solicitud con su motivo sin tocar el plan vigente.
5. Revocar devuelve al plan gratuito.
6. Quien no es super-admin recibe 403 en todas las rutas de admin.
7. Los avisos en vivo van con dueño: la solicitud solo al admin, la
   aprobación solo al usuario. Nadie más los ve.
8. Lo que se guarda sobrevive a reabrir la base (columnas nuevas y migración
   de una tabla antigua sin ellas).

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/compra_de_plan.py

Offline: no toca la red ni gasta cupo de ningún modelo. El gemelo Postgres se
comprueba en `postgres_gemelos.py` (guion «usuarios»), que necesita una base.
"""

from __future__ import annotations

import asyncio
import json
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.application.account_service import AccountService  # noqa: E402
from src.domain.entities import UserAccount  # noqa: E402
from src.infrastructure.adapters.sqlite_user_repository import SqliteUserRepository  # noqa: E402
from src.infrastructure.entrypoints import api  # noqa: E402
from src.infrastructure.entrypoints.progreso import DIFUSOR  # noqa: E402

ADMIN = ("sub-admin", "Admin@Meta.com", "La Admin")
ANA = ("sub-ana", "ana@correo.com", "Ana")
BETO = ("sub-beto", "beto@correo.com", "Beto")
INSTRUCCIONES = "Modo demostración: no se cobra dinero.\\nSegunda línea."

fallos: list[str] = []


def comprobar(condicion: bool, mensaje: str) -> None:
    print(("  OK   " if condicion else "  FALLA") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


class LoopFalso:
    """Ejecuta al momento lo que el difusor programaría en el loop real."""

    @staticmethod
    def call_soon_threadsafe(fn, *args):
        fn(*args)


def escuchar(dueno: str) -> asyncio.Queue:
    cola: asyncio.Queue = asyncio.Queue(maxsize=100)
    DIFUSOR.suscribir(cola, LoopFalso(), dueno)  # type: ignore[arg-type]
    return cola


def eventos(cola: asyncio.Queue) -> list[dict]:
    salida = []
    while not cola.empty():
        texto = cola.get_nowait()
        if texto.startswith("{"):
            d = json.loads(texto)
            if d.get("t") == "cuenta":
                salida.append(d)
    return salida


def construir_app(repo: SqliteUserRepository) -> FastAPI:
    usuarios = {u[0]: u for u in (ADMIN, ANA, BETO)}

    def servicio() -> AccountService:
        return AccountService(repo, 1, 1, ["admin@meta.com"], INSTRUCCIONES)

    def usuario_de_prueba(x_test_user: str | None = Header(default=None)) -> UserAccount:
        if x_test_user not in usuarios:
            raise HTTPException(status_code=401, detail="sin sesión")
        sub, email, nombre = usuarios[x_test_user]
        return servicio().get_or_create(sub, email, nombre)

    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.get_account_service] = servicio
    app.dependency_overrides[api.get_current_user] = usuario_de_prueba
    return app


def main() -> int:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as carpeta:
        ruta = str(Path(carpeta) / "usuarios.db")

        # La tabla ANTIGUA (sin las columnas de pago) debe migrar sola.
        with sqlite3.connect(ruta) as conn:
            conn.execute(
                "CREATE TABLE users (sub TEXT PRIMARY KEY, email TEXT, name TEXT, plan TEXT DEFAULT 'free', "
                "paid INTEGER DEFAULT 0, status TEXT DEFAULT 'active', generations_used INTEGER DEFAULT 0, "
                "lessons_used INTEGER DEFAULT 0, approved_by TEXT DEFAULT '', created_at TEXT)"
            )
            conn.execute("INSERT INTO users (sub, email, name, created_at) VALUES ('viejo', 'v@x.com', 'V', '2026-01-01')")
        repo = SqliteUserRepository(ruta)
        viejo = repo.get("viejo")
        print("\n0. Una base antigua migra sin perder a nadie")
        comprobar(viejo is not None and viejo.payment_ref == "", "la tabla vieja gana las columnas nuevas")

        cliente = TestClient(construir_app(repo))
        h = lambda u: {"X-Test-User": u[0]}  # noqa: E731

        # El admin entra una vez (así tiene fila y se le puede avisar por su sub).
        cliente.get("/api/v1/agent/account/me", headers=h(ADMIN))
        oido_admin, oido_ana, oido_beto, oido_anonimo = (
            escuchar(ADMIN[0]), escuchar(ANA[0]), escuchar(BETO[0]), escuchar("")
        )

        print("\n1. Pedir un plan: pendiente, con referencia, importe e instrucciones")
        r = cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "studio"}, headers=h(ANA))
        d = r.json()
        comprobar(r.status_code == 200, f"la solicitud se acepta (HTTP {r.status_code})")
        comprobar(d["status"] == "pending_payment" and d["requested_plan"] == "studio", "queda pendiente del plan Studio")
        comprobar(bool(re.fullmatch(r"MA-[A-Z2-9]{6}", d["payment_ref"])), f"referencia con formato MA-XXXXXX ({d['payment_ref']})")
        comprobar(d["requested_amount_usd"] == 19, "importe en USD del plan pedido (19)")
        comprobar("demostración" in d["payment_instructions"] and "\n" in d["payment_instructions"],
                  "instrucciones de pago, con el \\n del entorno convertido en salto de línea")
        comprobar(not d["paid"] and d["generations_limit"] == 1, "el plan NO se activa solo por pedirlo")
        comprobar(d["requested_at"] != "", "queda la fecha de la solicitud")
        ref = d["payment_ref"]

        avisos_admin = eventos(oido_admin)
        comprobar(len(avisos_admin) == 1 and avisos_admin[0]["evento"] == "solicitud"
                  and avisos_admin[0]["ref"] == ref, "el admin recibe el aviso de la solicitud, con la referencia")
        comprobar(eventos(oido_ana) == [] and eventos(oido_beto) == [] and eventos(oido_anonimo) == [],
                  "nadie más ve la solicitud de Ana")

        r = cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "business"}, headers=h(ANA))
        comprobar(r.json()["payment_ref"] == ref and r.json()["requested_plan"] == "business",
                  "cambiar de plan con la solicitud abierta conserva la referencia")
        eventos(oido_admin)
        r = cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "free"}, headers=h(ANA))
        comprobar(r.status_code == 422, f"pedir el plan gratuito → 422 (HTTP {r.status_code})")
        r = cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "inventado"}, headers=h(ANA))
        comprobar(r.status_code == 422, f"plan inventado → 422 (HTTP {r.status_code})")

        print("\n2. Comprobante y cancelación")
        r = cliente.post("/api/v1/agent/account/payment-receipt", json={"receipt": "TX-778899\n"}, headers=h(ANA))
        comprobar(r.status_code == 200 and r.json()["payment_receipt"] == "TX-778899", "el comprobante se guarda (limpio)")
        comprobar(r.json()["status"] == "pending_payment", "y la solicitud sigue pendiente")
        r = cliente.post("/api/v1/agent/account/payment-receipt", json={"receipt": "X"}, headers=h(BETO))
        comprobar(r.status_code == 409, "sin solicitud pendiente, el comprobante → 409")
        r = cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "pro"}, headers=h(BETO))
        r = cliente.post("/api/v1/agent/account/cancel-request", headers=h(BETO))
        comprobar(r.status_code == 200 and r.json()["status"] == "active" and r.json()["payment_ref"] == "",
                  "Beto cancela su solicitud y queda limpia")
        r = cliente.post("/api/v1/agent/account/cancel-request", headers=h(BETO))
        comprobar(r.status_code == 409, "cancelar sin nada pendiente → 409")
        eventos(oido_admin)

        print("\n3. Solo el super-admin decide (403 para los demás)")
        for metodo, ruta_admin, cuerpo in (
            ("get", "/api/v1/agent/admin/pending", None),
            ("get", "/api/v1/agent/admin/paid", None),
            ("post", "/api/v1/agent/admin/approve", {"sub": ANA[0], "plan": ""}),
            ("post", "/api/v1/agent/admin/reject", {"sub": ANA[0], "reason": "x"}),
            ("post", "/api/v1/agent/admin/revoke", {"sub": ANA[0], "reason": "x"}),
        ):
            r = getattr(cliente, metodo)(ruta_admin, headers=h(BETO), **({"json": cuerpo} if cuerpo else {}))
            comprobar(r.status_code == 403, f"{ruta_admin} como Beto → 403 (HTTP {r.status_code})")
        comprobar(repo.get(ANA[0]).status == "pending_payment", "los intentos de Beto no tocaron la solicitud de Ana")

        print("\n4. El admin ve la bandeja con todo lo necesario para conciliar")
        r = cliente.get("/api/v1/agent/admin/pending", headers=h(ADMIN))
        fila = next((u for u in r.json() if u["sub"] == ANA[0]), {})
        comprobar(r.status_code == 200 and len(r.json()) == 1, "una solicitud pendiente (la de Ana)")
        comprobar(fila.get("name") == "Ana" and fila.get("email") == ANA[1], "con nombre y email")
        comprobar(fila.get("requested_plan") == "business" and fila.get("requested_amount_usd") == 29,
                  "con plan pedido e importe")
        comprobar(fila.get("payment_ref") == ref and fila.get("payment_receipt") == "TX-778899",
                  "con referencia y comprobante")
        comprobar(bool(fila.get("requested_at")), "con fecha de solicitud")

        print("\n5. Aprobar (cambiando el plan) activa el plan y avisa SOLO a Ana")
        r = cliente.post("/api/v1/agent/admin/approve", json={"sub": ANA[0], "plan": "Studio"}, headers=h(ADMIN))
        d = r.json()
        comprobar(r.status_code == 200 and d["paid"] and d["plan"] == "studio", "Ana queda en Studio pagado")
        comprobar(d["email"] == ANA[1] and d["name"] == "Ana", "aprobar ya no borra el email ni el nombre")
        comprobar(d["approved_by"] == "Admin@Meta.com" and bool(d["approved_at"]), "consta quién y cuándo aprobó")
        me = cliente.get("/api/v1/agent/account/me", headers=h(ANA)).json()
        comprobar(me["generations_remaining"] == -1 and me["ia_experta"] == "critico",
                  "el plan rige de verdad: proyectos ilimitados e IA experta")
        comprobar(me["approved_by"] == "", "el usuario no ve el email interno de quien aprobó")
        aviso = eventos(oido_ana)
        comprobar(len(aviso) == 1 and aviso[0]["evento"] == "aprobado" and aviso[0]["plan"] == "studio",
                  "Ana recibe «aprobado» con su plan")
        comprobar(eventos(oido_beto) == [] and eventos(oido_anonimo) == [], "nadie más se entera")
        r = cliente.post("/api/v1/agent/admin/approve", json={"sub": ANA[0], "plan": "free"}, headers=h(ADMIN))
        comprobar(r.status_code == 422, "aprobar el plan gratuito → 422 (eso es revocar)")
        r = cliente.post("/api/v1/agent/admin/approve", json={"sub": "no-existe", "plan": ""}, headers=h(ADMIN))
        comprobar(r.status_code == 404, "aprobar a alguien que no existe → 404")

        print("\n6. Rechazar cierra la solicitud con su motivo, sin tocar el plan vigente")
        cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "business"}, headers=h(ANA))
        eventos(oido_admin)
        r = cliente.post("/api/v1/agent/admin/reject", json={"sub": ANA[0], "reason": "No llegó el pago"}, headers=h(ADMIN))
        d = r.json()
        comprobar(r.status_code == 200 and d["status"] == "active", "la solicitud se cierra")
        comprobar(d["paid"] and d["plan"] == "studio", "Ana sigue en Studio (el rechazo no le quita lo que pagó)")
        comprobar(d["rejection_reason"] == "No llegó el pago", "queda el motivo, para que ella lo vea")
        aviso = eventos(oido_ana)
        comprobar(len(aviso) == 1 and aviso[0]["evento"] == "rechazado" and aviso[0]["motivo"] == "No llegó el pago"
                  and aviso[0]["plan"] == "business", "Ana recibe «rechazado» con el plan pedido y el motivo")
        r = cliente.post("/api/v1/agent/admin/reject", json={"sub": ANA[0]}, headers=h(ADMIN))
        comprobar(r.status_code == 404, "rechazar sin solicitud pendiente → 404")

        print("\n7. La lista de pagados y la revocación")
        r = cliente.get("/api/v1/agent/admin/paid", headers=h(ADMIN))
        comprobar([u["sub"] for u in r.json()] == [ANA[0]], "Ana aparece entre los usuarios de pago")
        r = cliente.post("/api/v1/agent/admin/revoke", json={"sub": ANA[0], "reason": "Fin de la demo"}, headers=h(ADMIN))
        d = r.json()
        comprobar(r.status_code == 200 and not d["paid"] and d["plan"] == "free", "Ana vuelve al plan gratuito")
        comprobar(d["generations_limit"] == 1, "y vuelve a tener el cupo gratuito")
        aviso = eventos(oido_ana)
        comprobar(len(aviso) == 1 and aviso[0]["evento"] == "revocado" and aviso[0]["plan"] == "studio",
                  "Ana recibe «revocado» con el plan que tenía")
        r = cliente.post("/api/v1/agent/admin/revoke", json={"sub": ANA[0]}, headers=h(ADMIN))
        comprobar(r.status_code == 404, "revocar a quien ya es gratuito → 404")
        comprobar(cliente.get("/api/v1/agent/admin/paid", headers=h(ADMIN)).json() == [], "ya no hay usuarios de pago")

        print("\n8. Lo guardado sobrevive a reabrir la base")
        cliente.post("/api/v1/agent/account/request-upgrade", json={"plan": "pro"}, headers=h(BETO))
        cliente.post("/api/v1/agent/account/payment-receipt", json={"receipt": "REC-1"}, headers=h(BETO))
        de_nuevo = SqliteUserRepository(ruta).get(BETO[0])
        comprobar(de_nuevo.status == "pending_payment" and de_nuevo.requested_plan == "pro"
                  and de_nuevo.payment_ref.startswith("MA-") and de_nuevo.payment_receipt == "REC-1"
                  and bool(de_nuevo.requested_at), "referencia, comprobante, plan y fecha persisten")
        ana = SqliteUserRepository(ruta).get(ANA[0])
        comprobar(ana.rejection_reason == "Fin de la demo" and ana.approved_by == "Admin@Meta.com",
                  "el motivo de la revocación y quién aprobó persisten")

        for cola in (oido_admin, oido_ana, oido_beto, oido_anonimo):
            DIFUSOR.desuscribir(cola)

    print("\n" + ("=== FIN OK ===" if not fallos else "=== FALLOS: %d ===" % len(fallos)))
    for fallo in fallos:
        print(" - " + fallo)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
