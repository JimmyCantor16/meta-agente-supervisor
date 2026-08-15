"""Backend de la TIENDA generada.

A diferencia del esqueleto por dominio, aquí el esquema es FIJO —productos,
pedidos y líneas de pedido son siempre los mismos— y lo único que cambia entre
una tienda y otra es el catálogo. Por eso casi todo este módulo son cadenas
constantes y solo la semilla se genera: menos código que armar, menos sitios
donde equivocarse.

La regla que define este backend
--------------------------------
**El precio y el total los pone el SERVIDOR, leyéndolos de su base de datos.**
El navegador manda únicamente qué producto y cuántas unidades. Nunca manda
precios, y si los mandara se ignorarían.

No es purismo: un carrito que confía en el precio que le llega del cliente le
deja a cualquiera comprar por lo que quiera con solo abrir las herramientas del
navegador. Y es exactamente lo que hacía la versión anterior, donde el total era
un campo de texto que el usuario rellenaba a mano.
"""

from __future__ import annotations

from src.domain.dominio_tienda import DominioTienda

#: Cuenta de quien COMPRA en la demostración: existe para que quien reciba el
#: enlace pueda mirar la tienda y su historial en un clic, sin registrarse.
USUARIO_DEMO = "cliente"
CLAVE_DEMO = "cliente1234"

#: Cuenta del DUEÑO. Gestiona el catálogo y ve todas las ventas. El manual le
#: pide cambiar la contraseña como primer paso.
ADMIN_USUARIO = "admin"
ADMIN_CLAVE = "admin1234"

_DRIVER = {
    "sqlite": "",
    "mysql": "pymysql==1.1.1\n",
    "postgres": "psycopg[binary]==3.1.19\n",
}


def _requirements(motor: str) -> str:
    return (
        "fastapi==0.111.0\n"
        "uvicorn==0.30.1\n"
        "sqlalchemy==2.0.30\n"
        "pydantic==2.7.4\n"
        "passlib==1.7.4\n"
        "bcrypt==4.0.1\n"
        "python-jose==3.3.0\n"
        "python-multipart==0.0.9\n"
    ) + _DRIVER.get(motor, "")


def _entities() -> str:
    return '''"""Dominio: entidades puras. NO importan FastAPI ni SQLAlchemy."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class User:
    id: int
    username: str
    es_admin: bool = False


@dataclass
class Producto:
    id: int
    nombre: str
    precio: float
    descripcion: str = ""
    categoria: str = ""
    stock: int = 0

    @property
    def agotado(self) -> bool:
        return self.stock <= 0


@dataclass
class LineaPedido:
    """Una línea del pedido: qué producto, cuántos y a qué precio se vendió.

    `precio_unitario` se copia AQUÍ a propósito, en vez de mirarlo en el
    producto cada vez. Es un dato histórico: si mañana sube el precio, un pedido
    de ayer debe seguir diciendo lo que se pagó ayer. Sin esta copia, cambiar
    una etiqueta reescribiría en silencio todas las ventas pasadas.
    """

    producto_id: int
    nombre: str
    precio_unitario: float
    cantidad: int

    @property
    def subtotal(self) -> float:
        return round(self.precio_unitario * self.cantidad, 2)


@dataclass
class Pedido:
    id: int
    user_id: int
    fecha: str
    lineas: list[LineaPedido] = field(default_factory=list)
    envio: float = 0.0
    estado: str = "confirmado"

    @property
    def articulos(self) -> int:
        return sum(l.cantidad for l in self.lineas)

    @property
    def subtotal(self) -> float:
        return round(sum(l.subtotal for l in self.lineas), 2)

    @property
    def total(self) -> float:
        """El total SIEMPRE se calcula. No hay un campo que alguien pueda teclear."""
        return round(self.subtotal + self.envio, 2)
'''


def _ports() -> str:
    return '''"""Puertos: lo que la aplicación necesita, sin decir con qué se implementa."""
from __future__ import annotations

from abc import ABC, abstractmethod

from backend.domain.entities import Pedido, Producto, User


class UserRepository(ABC):
    @abstractmethod
    def por_username(self, username: str) -> User | None: ...

    @abstractmethod
    def hash_de(self, username: str) -> str | None: ...

    @abstractmethod
    def crear(self, username: str, hashed: str, es_admin: bool = False) -> User: ...

    @abstractmethod
    def existe_alguno(self) -> bool: ...


class ProductoRepository(ABC):
    @abstractmethod
    def listar(self, categoria: str = "", busqueda: str = "") -> list[Producto]: ...

    @abstractmethod
    def por_id(self, producto_id: int) -> Producto | None: ...

    @abstractmethod
    def crear(self, datos: dict) -> Producto: ...

    @abstractmethod
    def actualizar(self, producto_id: int, datos: dict) -> Producto | None: ...

    @abstractmethod
    def borrar(self, producto_id: int) -> bool: ...

    @abstractmethod
    def descontar_stock(self, producto_id: int, unidades: int) -> bool:
        """Baja el stock si alcanza. False si no alcanzaba (nadie más lo reservó)."""


class PedidoRepository(ABC):
    @abstractmethod
    def crear(self, user_id: int, lineas: list[dict], envio: float) -> Pedido: ...

    @abstractmethod
    def de_usuario(self, user_id: int) -> list[Pedido]: ...

    @abstractmethod
    def todos(self) -> list[Pedido]: ...

    @abstractmethod
    def por_id(self, pedido_id: int) -> Pedido | None: ...


class PasswordHasher(ABC):
    @abstractmethod
    def hash(self, plain: str) -> str: ...

    @abstractmethod
    def verify(self, plain: str, hashed: str) -> bool: ...


class TokenService(ABC):
    """Firma y lee el token de sesión.

    Los nombres son los del adaptador que lo implementa (`JwtTokenService`),
    compartido con el otro esqueleto: un puerto que no encaja con su adaptador
    no falla al escribirlo, falla al ARRANCAR, y con un mensaje sobre clases
    abstractas que no dice nada del problema real.
    """

    @abstractmethod
    def issue(self, username: str) -> str: ...

    @abstractmethod
    def username_from(self, token: str) -> str | None: ...
'''


def _services(d: DominioTienda) -> str:
    """Casos de uso. Lo único que depende de la tienda es el coste de envío."""
    return f'''"""Casos de uso: las reglas del negocio, sin FastAPI dentro."""
from __future__ import annotations

from datetime import datetime

from backend.domain.entities import Pedido, Producto, User
from backend.domain.ports import (
    PasswordHasher, PedidoRepository, ProductoRepository, TokenService, UserRepository,
)

#: Coste de envío de esta tienda. 0 = envío gratis (y así se dice en pantalla).
ENVIO = {d.envio!r}

#: Tope por línea. No es burocracia: sin límite, un cero de más en la cantidad
#: vacía el stock de un artículo en un clic.
MAXIMO_POR_LINEA = 99


class AuthError(Exception):
    """Credenciales que no valen."""


class ValidacionError(Exception):
    """Lo que llegó no se puede procesar. El mensaje es para el usuario."""


class PermisoError(Exception):
    """Autenticado, pero esto no es suyo."""


def validar_credenciales(username: str, password: str) -> tuple[str, str]:
    """Mismas reglas que valida el navegador. Aquí NO son comodidad: son la ley."""
    u = (username or "").strip()
    p = password or ""
    if len(u) < 3 or len(u) > 30:
        raise ValidacionError("El usuario debe tener entre 3 y 30 caracteres.")
    if not all(c.isalnum() or c in "._-" for c in u):
        raise ValidacionError("El usuario solo admite letras, números, punto, guion y guion bajo.")
    if len(p) < 8:
        raise ValidacionError("La contraseña debe tener 8 caracteres o más.")
    if not any(c.isalpha() for c in p) or not any(c.isdigit() for c in p):
        raise ValidacionError("La contraseña debe llevar letras y números.")
    return u, p


class AuthService:
    def __init__(self, users: UserRepository, hasher: PasswordHasher, tokens: TokenService) -> None:
        self._users, self._hasher, self._tokens = users, hasher, tokens

    def registrar(self, username: str, password: str) -> User:
        u, p = validar_credenciales(username, password)
        if self._users.por_username(u):
            raise ValidacionError("Ese usuario ya existe.")
        return self._users.crear(u, self._hasher.hash(p))

    def entrar(self, username: str, password: str) -> str:
        u = (username or "").strip()
        hashed = self._users.hash_de(u)
        # Se comprueba el hash aunque el usuario no exista para no delatar por
        # el tiempo de respuesta cuáles son cuentas reales.
        if not hashed or not self._hasher.verify(password or "", hashed):
            raise AuthError("Usuario o contraseña incorrectos.")
        return self._tokens.issue(u)

    def usuario_de_token(self, token: str) -> User:
        sub = self._tokens.username_from(token)
        user = self._users.por_username(sub) if sub else None
        if not user:
            raise AuthError("Sesión no válida.")
        return user


class CatalogoService:
    """El escaparate. Se mira SIN cuenta: una tienda que exige registrarse
    para enseñar el precio no vende."""

    def __init__(self, productos: ProductoRepository) -> None:
        self._productos = productos

    def listar(self, categoria: str = "", busqueda: str = "") -> list[Producto]:
        return self._productos.listar((categoria or "").strip(), (busqueda or "").strip())

    def por_id(self, producto_id: int) -> Producto:
        producto = self._productos.por_id(producto_id)
        if not producto:
            raise ValidacionError("Ese producto ya no está disponible.")
        return producto

    # --- gestión del dueño ---
    def crear(self, datos: dict) -> Producto:
        return self._productos.crear(self._limpiar(datos))

    def actualizar(self, producto_id: int, datos: dict) -> Producto:
        producto = self._productos.actualizar(producto_id, self._limpiar(datos))
        if not producto:
            raise ValidacionError("Ese producto ya no existe.")
        return producto

    def borrar(self, producto_id: int) -> None:
        if not self._productos.borrar(producto_id):
            raise ValidacionError("Ese producto ya no existe.")

    @staticmethod
    def _limpiar(datos: dict) -> dict:
        nombre = str((datos or {{}}).get("nombre") or "").strip()
        if not nombre:
            raise ValidacionError("El producto necesita un nombre.")
        try:
            precio = round(float((datos or {{}}).get("precio") or 0), 2)
        except (TypeError, ValueError):
            raise ValidacionError("El precio debe ser un número.") from None
        if precio <= 0:
            raise ValidacionError("El precio debe ser mayor que cero.")
        try:
            stock = int((datos or {{}}).get("stock") or 0)
        except (TypeError, ValueError):
            raise ValidacionError("El stock debe ser un número entero.") from None
        if stock < 0:
            raise ValidacionError("El stock no puede ser negativo.")
        return {{
            "nombre": nombre[:200],
            "precio": precio,
            "stock": stock,
            "descripcion": str((datos or {{}}).get("descripcion") or "").strip()[:400],
            "categoria": str((datos or {{}}).get("categoria") or "").strip()[:60],
        }}


class PedidoService:
    """El carrito se convierte en pedido AQUÍ, y aquí se calcula lo que se cobra."""

    def __init__(self, pedidos: PedidoRepository, productos: ProductoRepository) -> None:
        self._pedidos, self._productos = pedidos, productos

    def crear(self, user: User, lineas_pedidas: list) -> Pedido:
        """Confirma la compra.

        El cliente manda SOLO `producto_id` y `cantidad`. El precio se lee de la
        base de datos, uno por uno, y con él se calcula el total. Si el precio
        viniera del navegador, cualquiera compraría a lo que quisiera.
        """
        if not isinstance(lineas_pedidas, list) or not lineas_pedidas:
            raise ValidacionError("El carrito está vacío.")

        # Se agrupa por producto: dos líneas del mismo artículo son una sola
        # compra de la suma. Sin esto, el control de stock se puede burlar
        # partiendo la cantidad en varias líneas que pasan el tope por separado.
        pedidas: dict[int, int] = {{}}
        for cruda in lineas_pedidas:
            if not isinstance(cruda, dict):
                raise ValidacionError("Hay una línea del carrito mal formada.")
            try:
                producto_id = int(cruda.get("producto_id"))
                cantidad = int(cruda.get("cantidad"))
            except (TypeError, ValueError):
                raise ValidacionError("Producto o cantidad no válidos.") from None
            if cantidad < 1:
                raise ValidacionError("La cantidad debe ser al menos 1.")
            pedidas[producto_id] = pedidas.get(producto_id, 0) + cantidad

        lineas: list[dict] = []
        for producto_id, cantidad in pedidas.items():
            if cantidad > MAXIMO_POR_LINEA:
                raise ValidacionError(f"Como mucho {{MAXIMO_POR_LINEA}} unidades por producto.")
            producto = self._productos.por_id(producto_id)
            if not producto:
                raise ValidacionError("Un producto del carrito ya no está disponible.")
            if producto.stock < cantidad:
                raise ValidacionError(
                    f"De «{{producto.nombre}}» solo quedan {{producto.stock}}."
                    if producto.stock
                    else f"«{{producto.nombre}}» se ha agotado."
                )
            lineas.append({{
                "producto_id": producto.id,
                "nombre": producto.nombre,
                # EL PRECIO SALE DE AQUÍ, de la base de datos. Nunca del cliente.
                "precio_unitario": producto.precio,
                "cantidad": cantidad,
            }})

        # El stock se descuenta ANTES de crear el pedido y se comprueba otra vez
        # al descontarlo: entre la lectura de arriba y este momento puede haber
        # comprado otra persona. Lo ya descontado se devuelve si algo falla, para
        # no dejar unidades retenidas por un pedido que no llegó a existir.
        descontados: list[tuple[int, int]] = []
        for linea in lineas:
            if not self._productos.descontar_stock(linea["producto_id"], linea["cantidad"]):
                for pid, unidades in descontados:
                    self._productos.descontar_stock(pid, -unidades)
                raise ValidacionError(
                    f"«{{linea['nombre']}}» se agotó mientras comprabas. Ajusta el carrito."
                )
            descontados.append((linea["producto_id"], linea["cantidad"]))

        return self._pedidos.crear(user.id, lineas, ENVIO)

    def mios(self, user: User) -> list[Pedido]:
        return self._pedidos.de_usuario(user.id)

    def uno(self, user: User, pedido_id: int) -> Pedido:
        pedido = self._pedidos.por_id(pedido_id)
        if not pedido:
            raise ValidacionError("Ese pedido no existe.")
        # El dueño ve todos; cada cliente, solo los suyos.
        if pedido.user_id != user.id and not user.es_admin:
            raise PermisoError("Ese pedido no es tuyo.")
        return pedido

    def todos(self) -> list[Pedido]:
        return self._pedidos.todos()

    def resumen(self, user: User) -> dict:
        """Los números de la cabecera. El dueño ve el negocio; el cliente, lo suyo."""
        pedidos = self._pedidos.todos() if user.es_admin else self._pedidos.de_usuario(user.id)
        vendido = round(sum(p.total for p in pedidos), 2)
        articulos = sum(p.articulos for p in pedidos)
        return {{
            "es_admin": user.es_admin,
            "pedidos": len(pedidos),
            "articulos": articulos,
            "total": vendido,
            "ticket_medio": round(vendido / len(pedidos), 2) if pedidos else 0.0,
        }}
'''


def _db() -> str:
    """Esquema fijo: en una tienda las tablas no dependen de lo que se venda."""
    return '''"""Infraestructura: base de datos y modelos ORM."""
from __future__ import annotations

import os

from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text, create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

# La conexión se lee del ENTORNO, nunca fija en el código: así el mismo código
# corre con SQLite en tu portátil y con el MySQL o el PostgreSQL de tu servidor
# sin tocar una línea. Si no hay nada configurado, usa un archivo SQLite local.
_URL = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "sqlite:///./tienda.db"

# El prefijo se normaliza al driver que ESTE proyecto declara en requirements.
# Sin esto, SQLAlchemy elige el driver por defecto de cada motor —psycopg2 para
# `postgresql://` y MySQLdb para `mysql://`— y ninguno está instalado: la
# aplicación muere al arrancar con `ModuleNotFoundError`.
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
_opciones = (
    {"connect_args": {"check_same_thread": False}}
    if _URL.startswith("sqlite")
    else {"pool_pre_ping": True}
)

engine = create_engine(_URL, **_opciones)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    es_admin = Column(Boolean, nullable=False, default=False)


class ProductoModel(Base):
    __tablename__ = "productos"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    precio = Column(Float, nullable=False, default=0.0)
    descripcion = Column(Text, nullable=False, default="")
    categoria = Column(String(60), nullable=False, default="", index=True)
    stock = Column(Integer, nullable=False, default=0)


class PedidoModel(Base):
    __tablename__ = "pedidos"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    fecha = Column(String(30), nullable=False)
    envio = Column(Float, nullable=False, default=0.0)
    estado = Column(String(30), nullable=False, default="confirmado")
    lineas = relationship(
        "LineaModel", back_populates="pedido", cascade="all, delete-orphan", lazy="joined"
    )


class LineaModel(Base):
    """Una línea del pedido.

    Guarda `nombre` y `precio_unitario` copiados del producto, no una simple
    referencia: un pedido debe poder leerse dentro de un año aunque el producto
    haya cambiado de precio o se haya retirado del catálogo.
    """

    __tablename__ = "pedido_lineas"
    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id"), nullable=False, index=True)
    producto_id = Column(Integer, nullable=False)
    nombre = Column(String(200), nullable=False)
    precio_unitario = Column(Float, nullable=False, default=0.0)
    cantidad = Column(Integer, nullable=False, default=1)
    pedido = relationship("PedidoModel", back_populates="lineas")


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
'''


def _semilla(d: DominioTienda) -> str:
    """Los datos iniciales de ESTA tienda: lo único que cambia entre una y otra."""
    productos = [
        {
            "nombre": p.nombre,
            "precio": p.precio,
            "descripcion": p.descripcion,
            "categoria": p.categoria,
            "stock": p.stock,
        }
        for p in d.productos
    ]
    return f'''"""Datos iniciales de la tienda. Se siembran en el primer arranque.

Una tienda que abre VACÍA no parece nueva, parece rota: no hay nada que mirar,
el buscador no devuelve nada y el resumen marca cero. Por eso el catálogo entra
con el sistema, y con él dos pedidos de ejemplo para que el historial y las
ventas tengan algo dentro desde el primer minuto.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from backend.infrastructure.db import (
    LineaModel, PedidoModel, ProductoModel, SessionLocal, UserModel,
)

#: Cuenta de quien COMPRA en la demostración: quien reciba el enlace mira la
#: tienda y su historial en un clic, sin registrarse.
USUARIO_DEMO = "{USUARIO_DEMO}"
CLAVE_DEMO = "{CLAVE_DEMO}"

#: Cuenta del DUEÑO: gestiona el catálogo y ve todas las ventas.
ADMIN_USUARIO = "{ADMIN_USUARIO}"
ADMIN_CLAVE = "{ADMIN_CLAVE}"

ENVIO = {d.envio!r}

PRODUCTOS = {productos!r}


def sembrar_demostracion(hasher) -> bool:
    """Deja la tienda LISTA PARA USAR. True si sembró algo.

    Tres siembras independientes, cada una de un solo disparo, para que añadir
    una no borre ni duplique lo que ya hubiera.
    """
    sembrado = False
    sesion = SessionLocal()
    try:
        # 1) Las dos cuentas: el dueño y el cliente de demostración.
        for usuario, clave, es_admin in (
            (ADMIN_USUARIO, ADMIN_CLAVE, True),
            (USUARIO_DEMO, CLAVE_DEMO, False),
        ):
            if not sesion.query(UserModel).filter(UserModel.username == usuario).first():
                sesion.add(UserModel(
                    username=usuario,
                    hashed_password=hasher.hash(clave),
                    es_admin=es_admin,
                ))
                sembrado = True
        sesion.commit()

        # 2) El catálogo, si no hay ni un producto.
        if not sesion.query(ProductoModel).first():
            for datos in PRODUCTOS:
                sesion.add(ProductoModel(**datos))
            sesion.commit()
            sembrado = True

        # 3) Dos pedidos del cliente de demostración, si no hay ninguno. Se
        #    arman con los productos REALES ya sembrados, así que los totales
        #    cuadran con el catálogo que se ve en pantalla.
        if not sesion.query(PedidoModel).first():
            cliente = sesion.query(UserModel).filter(UserModel.username == USUARIO_DEMO).first()
            catalogo = sesion.query(ProductoModel).order_by(ProductoModel.id).limit(4).all()
            if cliente and len(catalogo) >= 2:
                reparto = [catalogo[:2], catalogo[2:4] or catalogo[:1]]
                for i, articulos in enumerate(reparto):
                    if not articulos:
                        continue
                    fecha = (datetime.now() - timedelta(days=3 * (i + 1))).strftime("%Y-%m-%d")
                    pedido = PedidoModel(
                        user_id=cliente.id, fecha=fecha, envio=ENVIO, estado="confirmado"
                    )
                    for n, producto in enumerate(articulos):
                        cantidad = 1 + (n % 2)
                        pedido.lineas.append(LineaModel(
                            producto_id=producto.id,
                            nombre=producto.nombre,
                            precio_unitario=producto.precio,
                            cantidad=cantidad,
                        ))
                        # Lo vendido en la demostración se descuenta del stock:
                        # si no, el catálogo diría que hay más de lo que hay.
                        producto.stock = max(0, producto.stock - cantidad)
                    sesion.add(pedido)
                sesion.commit()
                sembrado = True
        return sembrado
    finally:
        sesion.close()
'''


def _repositories() -> str:
    return '''"""Adaptadores de persistencia: los puertos, contra SQLAlchemy."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.domain.entities import LineaPedido, Pedido, Producto, User
from backend.domain.ports import PedidoRepository, ProductoRepository, UserRepository
from backend.infrastructure.db import LineaModel, PedidoModel, ProductoModel, UserModel


def _a_user(row: UserModel) -> User:
    return User(id=row.id, username=row.username, es_admin=bool(row.es_admin))


def _a_producto(row: ProductoModel) -> Producto:
    return Producto(
        id=row.id,
        nombre=row.nombre,
        precio=float(row.precio or 0),
        descripcion=row.descripcion or "",
        categoria=row.categoria or "",
        stock=int(row.stock or 0),
    )


def _a_pedido(row: PedidoModel) -> Pedido:
    return Pedido(
        id=row.id,
        user_id=row.user_id,
        fecha=row.fecha,
        envio=float(row.envio or 0),
        estado=row.estado or "confirmado",
        lineas=[
            LineaPedido(
                producto_id=l.producto_id,
                nombre=l.nombre,
                precio_unitario=float(l.precio_unitario or 0),
                cantidad=int(l.cantidad or 0),
            )
            for l in row.lineas
        ],
    )


class SqlUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def por_username(self, username: str) -> User | None:
        row = self._s.query(UserModel).filter(UserModel.username == username).first()
        return _a_user(row) if row else None

    def hash_de(self, username: str) -> str | None:
        row = self._s.query(UserModel).filter(UserModel.username == username).first()
        return row.hashed_password if row else None

    def crear(self, username: str, hashed: str, es_admin: bool = False) -> User:
        row = UserModel(username=username, hashed_password=hashed, es_admin=es_admin)
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _a_user(row)

    def existe_alguno(self) -> bool:
        return self._s.query(UserModel).first() is not None


class SqlProductoRepository(ProductoRepository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def listar(self, categoria: str = "", busqueda: str = "") -> list[Producto]:
        consulta = self._s.query(ProductoModel)
        if categoria:
            consulta = consulta.filter(ProductoModel.categoria == categoria)
        if busqueda:
            patron = f"%{busqueda}%"
            consulta = consulta.filter(
                or_(ProductoModel.nombre.ilike(patron), ProductoModel.descripcion.ilike(patron))
            )
        return [_a_producto(r) for r in consulta.order_by(ProductoModel.id).all()]

    def por_id(self, producto_id: int) -> Producto | None:
        row = self._s.get(ProductoModel, producto_id)
        return _a_producto(row) if row else None

    def crear(self, datos: dict) -> Producto:
        row = ProductoModel(**datos)
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _a_producto(row)

    def actualizar(self, producto_id: int, datos: dict) -> Producto | None:
        row = self._s.get(ProductoModel, producto_id)
        if not row:
            return None
        for clave, valor in datos.items():
            setattr(row, clave, valor)
        self._s.commit()
        self._s.refresh(row)
        return _a_producto(row)

    def borrar(self, producto_id: int) -> bool:
        row = self._s.get(ProductoModel, producto_id)
        if not row:
            return False
        self._s.delete(row)
        self._s.commit()
        return True

    def descontar_stock(self, producto_id: int, unidades: int) -> bool:
        """Baja el stock en una sola sentencia condicionada.

        El `filter(stock >= unidades)` va DENTRO del UPDATE a propósito: leer el
        stock y luego escribirlo deja una rendija entre las dos operaciones por
        la que dos compras simultáneas venden la misma última unidad. Así, quien
        pierda la carrera actualiza 0 filas y se entera.
        """
        consulta = self._s.query(ProductoModel).filter(ProductoModel.id == producto_id)
        if unidades > 0:
            consulta = consulta.filter(ProductoModel.stock >= unidades)
        afectadas = consulta.update(
            {ProductoModel.stock: ProductoModel.stock - unidades},
            synchronize_session=False,
        )
        self._s.commit()
        return bool(afectadas)


class SqlPedidoRepository(PedidoRepository):
    def __init__(self, session: Session) -> None:
        self._s = session

    def crear(self, user_id: int, lineas: list[dict], envio: float) -> Pedido:
        row = PedidoModel(
            user_id=user_id,
            fecha=datetime.now().strftime("%Y-%m-%d"),
            envio=envio,
            estado="confirmado",
        )
        for linea in lineas:
            row.lineas.append(LineaModel(**linea))
        self._s.add(row)
        self._s.commit()
        self._s.refresh(row)
        return _a_pedido(row)

    def de_usuario(self, user_id: int) -> list[Pedido]:
        filas = (
            self._s.query(PedidoModel)
            .filter(PedidoModel.user_id == user_id)
            .order_by(PedidoModel.id.desc())
            .all()
        )
        return [_a_pedido(r) for r in filas]

    def todos(self) -> list[Pedido]:
        filas = self._s.query(PedidoModel).order_by(PedidoModel.id.desc()).all()
        return [_a_pedido(r) for r in filas]

    def por_id(self, pedido_id: int) -> Pedido | None:
        row = self._s.get(PedidoModel, pedido_id)
        return _a_pedido(row) if row else None
'''


def _web() -> str:
    return '''"""Entrypoint HTTP: traduce peticiones a casos de uso y errores a códigos."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.application.services import (
    AuthError, AuthService, CatalogoService, PedidoService, PermisoError, ValidacionError,
)
from backend.domain.entities import Pedido, Producto, User
from backend.infrastructure.db import SessionLocal
from backend.infrastructure.repositories import (
    SqlPedidoRepository, SqlProductoRepository, SqlUserRepository,
)
from backend.infrastructure.security import BcryptHasher, JwtTokenService

router = APIRouter(prefix="/api")
_oauth2 = OAuth2PasswordBearer(tokenUrl="api/login", auto_error=False)


class Credentials(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    es_admin: bool


class LineaIn(BaseModel):
    """Lo ÚNICO que el navegador puede decir de una línea.

    No hay campo de precio ni de total, y no es un olvido: el precio lo pone el
    servidor leyéndolo de su base de datos. Un carrito que acepta el precio del
    cliente deja comprar por lo que uno quiera.
    """

    producto_id: int
    cantidad: int = Field(ge=1, le=99)


class PedidoIn(BaseModel):
    lineas: list[LineaIn]


class ProductoIn(BaseModel):
    nombre: str
    precio: float
    stock: int = 0
    descripcion: str = ""
    categoria: str = ""


def get_session():
    sesion = SessionLocal()
    try:
        yield sesion
    finally:
        sesion.close()


def get_auth(session: Session = Depends(get_session)) -> AuthService:
    return AuthService(SqlUserRepository(session), BcryptHasher(), JwtTokenService())


def get_catalogo(session: Session = Depends(get_session)) -> CatalogoService:
    return CatalogoService(SqlProductoRepository(session))


def get_pedidos(session: Session = Depends(get_session)) -> PedidoService:
    return PedidoService(SqlPedidoRepository(session), SqlProductoRepository(session))


def current_user(token: str = Depends(_oauth2), auth: AuthService = Depends(get_auth)) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Entra con tu cuenta para continuar.")
    try:
        return auth.usuario_de_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def solo_admin(user: User = Depends(current_user)) -> User:
    if not user.es_admin:
        raise HTTPException(status_code=403, detail="Esto solo lo puede hacer el dueño.")
    return user


def _producto_json(p: Producto) -> dict:
    return {
        "id": p.id, "nombre": p.nombre, "precio": p.precio,
        "descripcion": p.descripcion, "categoria": p.categoria,
        "stock": p.stock, "agotado": p.agotado,
    }


def _pedido_json(p: Pedido) -> dict:
    return {
        "id": p.id, "fecha": p.fecha, "estado": p.estado, "envio": p.envio,
        "articulos": p.articulos, "subtotal": p.subtotal, "total": p.total,
        "lineas": [
            {
                "producto_id": l.producto_id, "nombre": l.nombre,
                "precio_unitario": l.precio_unitario, "cantidad": l.cantidad,
                "subtotal": l.subtotal,
            }
            for l in p.lineas
        ],
    }


# --- cuentas -----------------------------------------------------------------
@router.post("/register", status_code=201)
def register(body: Credentials, auth: AuthService = Depends(get_auth)):
    try:
        user = auth.registrar(body.username, body.password)
    except ValidacionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"id": user.id, "username": user.username}


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), auth: AuthService = Depends(get_auth)):
    try:
        return Token(access_token=auth.entrar(form.username, form.password))
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/me", response_model=UserOut)
def quien_soy(user: User = Depends(current_user)):
    return UserOut(id=user.id, username=user.username, es_admin=user.es_admin)


# --- escaparate (PÚBLICO: se mira sin cuenta) --------------------------------
@router.get("/productos")
def ver_productos(
    categoria: str = Query(default=""),
    q: str = Query(default=""),
    svc: CatalogoService = Depends(get_catalogo),
):
    return [_producto_json(p) for p in svc.listar(categoria, q)]


@router.get("/productos/{producto_id}")
def ver_producto(producto_id: int, svc: CatalogoService = Depends(get_catalogo)):
    try:
        return _producto_json(svc.por_id(producto_id))
    except ValidacionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --- comprar -----------------------------------------------------------------
@router.post("/pedidos", status_code=201)
def confirmar_compra(
    body: PedidoIn,
    user: User = Depends(current_user),
    svc: PedidoService = Depends(get_pedidos),
):
    try:
        pedido = svc.crear(user, [l.model_dump() for l in body.lineas])
    except ValidacionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _pedido_json(pedido)


@router.get("/pedidos")
def mis_pedidos(user: User = Depends(current_user), svc: PedidoService = Depends(get_pedidos)):
    return [_pedido_json(p) for p in svc.mios(user)]


@router.get("/pedidos/{pedido_id}")
def ver_pedido(
    pedido_id: int,
    user: User = Depends(current_user),
    svc: PedidoService = Depends(get_pedidos),
):
    try:
        return _pedido_json(svc.uno(user, pedido_id))
    except ValidacionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermisoError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/resumen")
def resumen(user: User = Depends(current_user), svc: PedidoService = Depends(get_pedidos)):
    return svc.resumen(user)


# --- gestión del dueño -------------------------------------------------------
@router.get("/admin/pedidos")
def todas_las_ventas(_: User = Depends(solo_admin), svc: PedidoService = Depends(get_pedidos)):
    return [_pedido_json(p) for p in svc.todos()]


@router.post("/admin/productos", status_code=201)
def crear_producto(
    body: ProductoIn,
    _: User = Depends(solo_admin),
    svc: CatalogoService = Depends(get_catalogo),
):
    try:
        return _producto_json(svc.crear(body.model_dump()))
    except ValidacionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/admin/productos/{producto_id}")
def actualizar_producto(
    producto_id: int,
    body: ProductoIn,
    _: User = Depends(solo_admin),
    svc: CatalogoService = Depends(get_catalogo),
):
    try:
        return _producto_json(svc.actualizar(producto_id, body.model_dump()))
    except ValidacionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/admin/productos/{producto_id}", status_code=204)
def borrar_producto(
    producto_id: int,
    _: User = Depends(solo_admin),
    svc: CatalogoService = Depends(get_catalogo),
):
    try:
        svc.borrar(producto_id)
    except ValidacionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
'''


def _main() -> str:
    return '''"""Arranque: crea el esquema, siembra la tienda y sirve la web."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.infrastructure.db import create_tables
from backend.infrastructure.security import BcryptHasher
from backend.infrastructure.semilla import sembrar_demostracion
from backend.infrastructure.web import router

app = FastAPI(title="Tienda")

# El esquema se crea AL ARRANCAR. Es el fallo que más veces ha dejado un
# sistema inservible: sin esto, la primera petición muere con «no such table».
create_tables()
sembrar_demostracion(BcryptHasher())

app.include_router(router)

_FRONT = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(str(_FRONT / "index.html"))


# El manifest y el service worker se sirven desde la RAÍZ para que su alcance
# cubra toda la página; si colgaran de /static solo controlarían esa carpeta.
@app.get("/manifest.json", include_in_schema=False)
def manifest():
    return FileResponse(str(_FRONT / "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js", include_in_schema=False)
def service_worker():
    return FileResponse(str(_FRONT / "sw.js"), media_type="application/javascript")
'''
