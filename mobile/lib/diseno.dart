/// Los tokens de diseño de la app móvil, en UN solo sitio.
///
/// Son los MISMOS que los de la web (`frontend/tailwind.config.js`): mismo
/// verde de marca, mismos grises con tinte azulado, mismos radios. Antes cada
/// archivo definía su propia paleta y el móvil seguía con el índigo `#6366F1`
/// que la web ya había abandonado, así que las dos aplicaciones del mismo
/// producto no se parecían.
///
/// Regla, igual que en la web: UN solo color de marca y cero gradientes. El
/// color se gana su presencia por escasez — botones principales, estado activo
/// y poco más.
library;

import 'package:flutter/material.dart';

// --- Marca -----------------------------------------------------------------
/// Verde de marca. Equivale a `brand-600` de la web (#027E6F).
const marca = Color(0xFF027E6F);

/// Su tono para pulsaciones y estados hover. `brand-700` (#04665A).
const marcaOscura = Color(0xFF04665A);

/// Acento para resaltados puntuales, nunca como fondo de texto. (#00E0AC)
const acento = Color(0xFF00E0AC);

// --- Superficies (tema oscuro) ---------------------------------------------
/// Fondo de la aplicación.
const fondo = Color(0xFF0B0C10);

/// Tarjetas y barras.
const tarjeta = Color(0xFF14161C);

/// Separadores.
const linea = Color(0xFF232630);

// --- Texto -----------------------------------------------------------------
/// Texto principal. Nunca blanco puro: va con tinte, como en la web.
const tinta = Color(0xFFF2F4F8);

/// Texto secundario.
const tintaSuave = Color(0xFF9AA0B0);

/// Texto terciario / deshabilitado.
const tintaTenue = Color(0xFF6E7484);

// --- Estados ---------------------------------------------------------------
/// Todo bien. Se usa el acento de marca en vez de un verde ajeno.
const exito = acento;

/// Algo falló.
const alerta = Color(0xFFFF6B6B);

/// Atención, pero no es un error.
const aviso = Color(0xFFE9A24C);

// --- Forma -----------------------------------------------------------------
/// Radio del sistema. 6px, como en la web: los radios grandes leen a plantilla.
const radio = 6.0;

/// Radio de las tarjetas grandes.
const radioTarjeta = 8.0;

/// El tema de la aplicación, derivado de los tokens de arriba.
ThemeData temaApp() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: fondo,
    colorScheme: base.colorScheme.copyWith(
      primary: marca,
      secondary: acento,
      surface: tarjeta,
      error: alerta,
    ),
    dividerColor: linea,
    cardTheme: CardThemeData(
      color: tarjeta,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radioTarjeta),
        side: const BorderSide(color: linea),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: marca,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radio)),
      ),
    ),
  );
}
