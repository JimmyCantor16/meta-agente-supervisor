// Diccionario de traducciones de la interfaz (i18n local, SIN llamadas a la IA).
// El idioma por defecto es 'es'. Para añadir un idioma nuevo basta con replicar
// la forma del objeto `es`: TypeScript obliga (vía el tipo `Translation`) a que
// cualquier otro idioma tenga EXACTAMENTE las mismas claves.

export const LANGUAGES = ["es", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

// --- Español (fuente de verdad de la estructura) ---
const es = {
  brand: { name: "Meta-Agente", tagline: "Workspace de IA" },
  nav: {
    home: "Inicio",
    projects: "Proyectos",
    learn: "Aprender",
    plans: "Planes",
    help: "Ayuda",
    admin: "Admin",
  },
  plans: {
    title: "Planes",
    subtitle: "Elige el plan que se ajuste a ti. El acceso se activa cuando un administrador confirma tu pago.",
    currentPlan: "Tu plan actual",
    choose: "Elegir este plan",
    choosing: "Solicitando…",
    requested: "Solicitado · pendiente de aprobación",
    popular: "Más popular",
    perMonth: "/ mes",
    forever: "para siempre",
    loginFirst: "Inicia sesión para elegir un plan.",
  },
  account: {
    generationsLeft: (n: number) => `${n} proyectos gratis`,
    lessonsLeft: (n: number) => `${n} clases gratis`,
    planActive: (plan: string) => `Plan ${plan} · activo ✓`,
    loginToGenerate: "Inicia sesión con Google para generar tu proyecto.",
    paymentTitle: "Alcanzaste tu límite gratuito",
    paymentIntro:
      "Para seguir generando y recibiendo clases, adquiere un plan. Un administrador debe confirmar tu pago.",
    requestUpgrade: "Quiero continuar (solicitar plan)",
    requesting: "Enviando…",
    pending: "⏳ Pago pendiente: un administrador debe confirmarlo para desbloquear tu plan.",
  },
  admin: {
    title: "Panel de administración",
    subtitle: "Usuarios que solicitaron continuar. Confirma su pago para activarlos.",
    empty: "No hay usuarios pendientes de aprobación.",
    approve: "Confirmar pago",
    approving: "Aprobando…",
    approved: "✓ Activado",
    used: "usados",
  },
  topbar: {
    web: "Web",
    desktop: "Escritorio",
    login: "Iniciar sesión",
    logout: "Salir",
  },
  hero: {
    greeting: "Hola 👋 Soy tu Meta-Agente",
    title: "Convierte tu idea en un sistema real",
    subtitle:
      "Describe lo que quieres construir. Evalúo la idea, la optimizo, genero el proyecto y te enseño a completarlo.",
  },
  promptInput: {
    placeholder:
      "Describe el sistema que quieres crear… Ej: una tienda online con carrito, login y panel de administración.",
    shortcutBefore: "Pulsa",
    shortcutAfter: "para evaluar",
    minChars: (current: number, min: number) =>
      `Escribe al menos ${min} caracteres (${current}/${min}).`,
    submit: "Evaluar idea",
    submitting: "Analizando…",
    teacherMode: "Modo profesor",
    teacherOn: "El agente te explicará y enseñará",
    teacherOff: "El agente hará el trabajo por ti",
  },
  states: {
    analyzing: "El agente está analizando tu idea…",
  },
  dashboard: {
    verdict: "Veredicto del agente:",
    approved: "✓ Aprobado",
    needsChanges: "⚠ Sugerir ajustes",
    criticalAnalysis: "Análisis crítico",
    suggestions: "Sugerencias de mejora",
    noSuggestions: "Sin sugerencias: la idea está lista para ejecutarse.",
    finalPrompt: "Prompt final optimizado",
    copy: "Copiar",
    copied: "¡Copiado! ✓",
    feedbackQuestion: "¿Te resultó útil esta evaluación?",
    feedbackYes: "👍 Útil",
    feedbackNo: "👎 No útil",
    feedbackThanks: "¡Gracias! El agente aprenderá de esto.",
    generateButton: "🚀 Generar proyecto",
    generating: "Generando proyecto…",
    generateHint: "Crea en tu disco un proyecto full-stack auto-instalable (front + back + base de datos + docker).",
    generatedTitle: "Proyecto generado",
    generatedSavedAt: "Guardado en:",
    generatedFiles: "Archivos:",
    generatedRun: "Para ejecutarlo:",
    auditButton: "🔍 Auditar y sugerir mejoras",
    auditing: "Auditando el código…",
    auditHint: "El agente lee el código generado y propone mejoras priorizadas (seguridad, tests, etc.).",
    auditSuggestions: "Sugerencias de mejora del agente",
    explainButton: "🎓 Explícame paso a paso",
    explaining: "Preparando la explicación…",
    teachingTitle: "Guía del profesor",
    teachingSteps: "Pasos para entenderlo",
    teachingConcepts: "Conceptos que aprenderás",
    teachingNext: "Siguientes retos",
  },
  gallery: {
    title: "Tus proyectos",
    empty: "Aún no has generado ningún proyecto. ¡Escribe una idea arriba!",
    files: "archivos",
  },
  usage: {
    freeLeft: (n: number) => `Te quedan ${n} generaciones gratis`,
    licensed: "Licencia activa ✓",
    limitReached: "Límite gratuito alcanzado",
  },
  license: {
    title: "Activa tu licencia",
    intro:
      "Alcanzaste el límite de proyectos gratuitos. Ingresa una licencia para seguir generando sin límite.",
    placeholder: "Clave de licencia",
    activate: "Activar",
    activating: "Activando…",
    success: "¡Licencia activada! Ya puedes generar sin límite.",
    demoHint: "Demo: usa la clave META-PRO-2026",
  },
  footer: "Arquitectura Hexagonal (FastAPI) · Feature-Driven (React + TS + Tailwind)",
};

// El tipo se deriva del español; todos los idiomas deben cumplirlo.
export type Translation = typeof es;

// --- Inglés (debe respetar la forma de `Translation`) ---
const en: Translation = {
  brand: { name: "Meta-Agent", tagline: "AI Workspace" },
  nav: {
    home: "Home",
    projects: "Projects",
    learn: "Learn",
    plans: "Plans",
    help: "Help",
    admin: "Admin",
  },
  plans: {
    title: "Plans",
    subtitle: "Choose the plan that fits you. Access is activated once an administrator confirms your payment.",
    currentPlan: "Your current plan",
    choose: "Choose this plan",
    choosing: "Requesting…",
    requested: "Requested · pending approval",
    popular: "Most popular",
    perMonth: "/ month",
    forever: "forever",
    loginFirst: "Sign in to choose a plan.",
  },
  account: {
    generationsLeft: (n: number) => `${n} free projects`,
    lessonsLeft: (n: number) => `${n} free lessons`,
    planActive: (plan: string) => `${plan} plan · active ✓`,
    loginToGenerate: "Sign in with Google to generate your project.",
    paymentTitle: "You reached your free limit",
    paymentIntro:
      "To keep generating and taking lessons, get a plan. An administrator must confirm your payment.",
    requestUpgrade: "I want to continue (request a plan)",
    requesting: "Sending…",
    pending: "⏳ Payment pending: an administrator must confirm it to unlock your plan.",
  },
  admin: {
    title: "Admin panel",
    subtitle: "Users who requested to continue. Confirm their payment to activate them.",
    empty: "No users pending approval.",
    approve: "Confirm payment",
    approving: "Approving…",
    approved: "✓ Activated",
    used: "used",
  },
  topbar: {
    web: "Web",
    desktop: "Desktop",
    login: "Sign in",
    logout: "Sign out",
  },
  hero: {
    greeting: "Hi 👋 I'm your Meta-Agent",
    title: "Turn your idea into a real system",
    subtitle:
      "Describe what you want to build. I assess the idea, optimize it, generate the project, and teach you how to finish it.",
  },
  promptInput: {
    placeholder:
      "Describe the system you want to build… E.g.: an online store with cart, login and an admin panel.",
    shortcutBefore: "Press",
    shortcutAfter: "to evaluate",
    minChars: (current: number, min: number) =>
      `Type at least ${min} characters (${current}/${min}).`,
    submit: "Evaluate idea",
    submitting: "Analyzing…",
    teacherMode: "Teacher mode",
    teacherOn: "The agent will explain and teach you",
    teacherOff: "The agent will do the work for you",
  },
  states: {
    analyzing: "The agent is analyzing your idea…",
  },
  dashboard: {
    verdict: "Agent verdict:",
    approved: "✓ Approved",
    needsChanges: "⚠ Suggest changes",
    criticalAnalysis: "Critical analysis",
    suggestions: "Improvement suggestions",
    noSuggestions: "No suggestions: the idea is ready to execute.",
    finalPrompt: "Optimized final prompt",
    copy: "Copy",
    copied: "Copied! ✓",
    feedbackQuestion: "Was this evaluation helpful?",
    feedbackYes: "👍 Helpful",
    feedbackNo: "👎 Not helpful",
    feedbackThanks: "Thanks! The agent will learn from this.",
    generateButton: "🚀 Generate project",
    generating: "Generating project…",
    generateHint: "Creates an auto-installable full-stack project on your disk (front + back + database + docker).",
    generatedTitle: "Generated project",
    generatedSavedAt: "Saved at:",
    generatedFiles: "Files:",
    generatedRun: "To run it:",
    auditButton: "🔍 Audit & suggest improvements",
    auditing: "Auditing the code…",
    auditHint: "The agent reads the generated code and proposes prioritized improvements (security, tests, etc.).",
    auditSuggestions: "Agent improvement suggestions",
    explainButton: "🎓 Explain step by step",
    explaining: "Preparing the explanation…",
    teachingTitle: "Teacher's guide",
    teachingSteps: "Steps to understand it",
    teachingConcepts: "Concepts you'll learn",
    teachingNext: "Next challenges",
  },
  gallery: {
    title: "Your projects",
    empty: "You haven't generated any project yet. Type an idea above!",
    files: "files",
  },
  usage: {
    freeLeft: (n: number) => `${n} free generations left`,
    licensed: "License active ✓",
    limitReached: "Free limit reached",
  },
  license: {
    title: "Activate your license",
    intro:
      "You've reached the free project limit. Enter a license to keep generating without limits.",
    placeholder: "License key",
    activate: "Activate",
    activating: "Activating…",
    success: "License activated! You can now generate without limits.",
    demoHint: "Demo: use the key META-PRO-2026",
  },
  footer: "Hexagonal Architecture (FastAPI) · Feature-Driven (React + TS + Tailwind)",
};

// Registro de idiomas disponibles, indexable por código.
export const translations: Record<Language, Translation> = { es, en };
