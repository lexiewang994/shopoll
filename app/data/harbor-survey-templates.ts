import type {
  ChoiceOptionV1,
  LocalizedText,
  SurveyDefinitionV1,
} from "../domain/types";

const t = (en: string, de: string, es: string): LocalizedText => ({ en, de, es });

export const PAPER7_REASON_OPTIONS: readonly ChoiceOptionV1[] = [
  { id: "eye_comfort", label: t("Zero blue light and eye comfort", "Kein blaues Licht und augenschonend", "Sin luz azul y mayor comodidad visual") },
  { id: "color_rlcd", label: t("60 Hz color RLCD display", "60-Hz-Farb-RLCD-Display", "Pantalla RLCD a color de 60 Hz") },
  { id: "android_apps", label: t("Access to Android apps", "Zugriff auf Android-Apps", "Acceso a aplicaciones Android") },
  { id: "reading_writing", label: t("Reading and handwriting", "Lesen und handschriftliche Notizen", "Lectura y escritura a mano") },
  { id: "outdoor_readability", label: t("Outdoor readability", "Lesbarkeit im Freien", "Legibilidad en exteriores") },
  { id: "portable", label: t("Thin and portable design", "Dünnes und tragbares Design", "Diseño fino y portátil") },
  { id: "reviews", label: t("Reviews or recommendations", "Bewertungen oder Empfehlungen", "Reseñas o recomendaciones") },
  { id: "price", label: t("Price or promotion", "Preis oder Angebot", "Precio o promoción") },
  { id: "other", label: t("Other", "Sonstiges", "Otro") },
] as const;

export const BRICBLOC_REASON_OPTIONS: readonly ChoiceOptionV1[] = [
  { id: "three_in_one", label: t("Charging, storage, and expansion in one", "Laden, Speicher und Erweiterung in einem", "Carga, almacenamiento y expansión en uno") },
  { id: "travel", label: t("Portable for travel", "Praktisch für Reisen", "Portátil para viajar") },
  { id: "gan_charging", label: t("GaN fast charging", "GaN-Schnellladen", "Carga rápida GaN") },
  { id: "ssd", label: t("Built-in SSD storage", "Integrierter SSD-Speicher", "Almacenamiento SSD integrado") },
  { id: "ports_4k", label: t("4K display and port expansion", "4K-Display- und Anschlusserweiterung", "Expansión de puertos y pantalla 4K") },
  { id: "magnetic_modular", label: t("Magnetic modular design", "Magnetisches modulares Design", "Diseño modular magnético") },
  { id: "reviews", label: t("Reviews or recommendations", "Bewertungen oder Empfehlungen", "Reseñas o recomendaciones") },
  { id: "price", label: t("Price or promotion", "Preis oder Angebot", "Precio o promoción") },
  { id: "other", label: t("Other", "Sonstiges", "Otro") },
] as const;

export const NEXUS_REASON_OPTIONS: readonly ChoiceOptionV1[] = [
  { id: "local_ai_privacy", label: t("Local AI and privacy", "Lokale KI und Datenschutz", "IA local y privacidad") },
  { id: "full_size_gpu", label: t("Full-size GPU support", "Unterstützung für GPUs voller Größe", "Compatibilidad con GPU de tamaño completo") },
  { id: "nas_storage", label: t("NAS and high-capacity storage", "NAS und Speicher mit hoher Kapazität", "NAS y almacenamiento de gran capacidad") },
  { id: "open_upgradeable", label: t("Open and upgradeable platform", "Offene und aufrüstbare Plattform", "Plataforma abierta y actualizable") },
  { id: "ecc_zfs", label: t("ECC memory and ZFS", "ECC-Speicher und ZFS", "Memoria ECC y ZFS") },
  { id: "dual_10gbe", label: t("Dual 10GbE networking", "Zweifaches 10GbE-Netzwerk", "Conectividad 10GbE doble") },
  { id: "cloud_cost", label: t("Reducing cloud costs", "Cloud-Kosten senken", "Reducir los costes de la nube") },
  { id: "quiet_compact", label: t("Quiet, compact design", "Leises, kompaktes Design", "Diseño silencioso y compacto") },
  { id: "other", label: t("Other", "Sonstiges", "Otro") },
] as const;

const DISCOVERY_OPTIONS: readonly ChoiceOptionV1[] = [
  { id: "search", label: t("Search engine", "Suchmaschine", "Motor de búsqueda") },
  { id: "social", label: t("Social media", "Soziale Medien", "Redes sociales") },
  { id: "video_creator", label: t("Video or creator", "Video oder Creator", "Vídeo o creador") },
  { id: "review", label: t("Review site or publication", "Testportal oder Publikation", "Sitio de reseñas o publicación") },
  { id: "friend", label: t("Friend or colleague", "Freund oder Kollege", "Amigo o colega") },
  { id: "community", label: t("Online community", "Online-Community", "Comunidad en línea") },
  { id: "event", label: t("Event or trade show", "Veranstaltung oder Messe", "Evento o feria") },
  { id: "other", label: t("Other", "Sonstiges", "Otro") },
] as const;

const BARRIER_OPTIONS: readonly ChoiceOptionV1[] = [
  { id: "price", label: t("Price", "Preis", "Precio") },
  { id: "product_uncertainty", label: t("Uncertainty about the product", "Unsicherheit über das Produkt", "Dudas sobre el producto") },
  { id: "compatibility", label: t("Compatibility", "Kompatibilität", "Compatibilidad") },
  { id: "reviews", label: t("Not enough reviews", "Nicht genügend Bewertungen", "No había suficientes reseñas") },
  { id: "shipping", label: t("Shipping time or cost", "Lieferzeit oder Versandkosten", "Tiempo o coste de envío") },
  { id: "returns", label: t("Returns or warranty", "Rückgabe oder Garantie", "Devoluciones o garantía") },
  { id: "availability", label: t("Availability", "Verfügbarkeit", "Disponibilidad") },
  { id: "nothing", label: t("Nothing almost stopped me", "Nichts hätte mich fast abgehalten", "Nada estuvo a punto de impedírmelo") },
  { id: "other", label: t("Other", "Sonstiges", "Otro") },
] as const;

const CART_EXIT_OPTIONS: readonly ChoiceOptionV1[] = [
  { id: "just_browsing", label: t("I am just browsing", "Ich sehe mich nur um", "Solo estoy mirando") },
  { id: "too_expensive", label: t("The total is too expensive", "Der Gesamtpreis ist zu hoch", "El total es demasiado caro") },
  { id: "shipping", label: t("Shipping cost or timing", "Versandkosten oder Lieferzeit", "Coste o plazo de envío") },
  { id: "need_research", label: t("I need more information", "Ich brauche weitere Informationen", "Necesito más información") },
  { id: "payment", label: t("My preferred payment option is missing", "Meine bevorzugte Zahlungsart fehlt", "Falta mi método de pago preferido") },
  { id: "technical", label: t("A technical issue", "Ein technisches Problem", "Un problema técnico") },
  { id: "other", label: t("Other", "Sonstiges", "Otro") },
] as const;

const commonEnd = {
  id: "end",
  kind: "end" as const,
  title: t("Thank you for your feedback.", "Vielen Dank für Ihr Feedback.", "Gracias por tus comentarios."),
  buttonLabel: t("Done", "Fertig", "Listo"),
};

export const PURCHASE_MOTIVATION_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-purchase-motivation",
  version: 1,
  slug: "purchase-motivation",
  internalName: "Harbor purchase motivation",
  category: "purchase_motivation",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("Tell us what mattered", "Sagen Sie uns, was wichtig war", "Cuéntanos qué fue importante"),
  description: t("Three quick questions about your purchase.", "Drei kurze Fragen zu Ihrem Kauf.", "Tres preguntas rápidas sobre tu compra."),
  metadata: {
    productRouting: "single_auto_multi_prompt_accessory_skip",
    coreProducts: ["paper7", "bricbloc", "nexus"],
  },
  questions: [
    {
      id: "welcome",
      kind: "welcome",
      title: t("Thanks for choosing Harbor Innovations", "Danke, dass Sie sich für Harbor Innovations entschieden haben", "Gracias por elegir Harbor Innovations"),
      description: t("Your answers help us build better products.", "Ihre Antworten helfen uns, bessere Produkte zu entwickeln.", "Tus respuestas nos ayudan a crear mejores productos."),
      buttonLabel: t("Start", "Starten", "Empezar"),
    },
    {
      id: "core_product",
      kind: "single_choice",
      title: t("Which product was the main reason for this purchase?", "Welches Produkt war der Hauptgrund für diesen Kauf?", "¿Qué producto fue el motivo principal de esta compra?"),
      required: true,
      options: [
        { id: "paper7", label: t("Paper7", "Paper7", "Paper7") },
        { id: "bricbloc", label: t("Bricbloc", "Bricbloc", "Bricbloc") },
        { id: "nexus", label: t("Nexus", "Nexus", "Nexus") },
      ],
    },
    {
      id: "paper7_reason",
      kind: "single_choice",
      title: t("What is the main reason you chose Paper7 today?", "Was ist der wichtigste Grund, warum Sie sich heute für Paper7 entschieden haben?", "¿Cuál es el motivo principal por el que elegiste Paper7 hoy?"),
      required: true,
      options: PAPER7_REASON_OPTIONS,
      visibleWhen: {
        mode: "all",
        conditions: [{ questionId: "core_product", operator: "equals", value: "paper7" }],
      },
    },
    {
      id: "bricbloc_reason",
      kind: "single_choice",
      title: t("What is the main reason you chose Bricbloc today?", "Was ist der wichtigste Grund, warum Sie sich heute für Bricbloc entschieden haben?", "¿Cuál es el motivo principal por el que elegiste Bricbloc hoy?"),
      required: true,
      options: BRICBLOC_REASON_OPTIONS,
      visibleWhen: {
        mode: "all",
        conditions: [{ questionId: "core_product", operator: "equals", value: "bricbloc" }],
      },
    },
    {
      id: "nexus_reason",
      kind: "single_choice",
      title: t("What is the main reason you chose Nexus today?", "Was ist der wichtigste Grund, warum Sie sich heute für Nexus entschieden haben?", "¿Cuál es el motivo principal por el que elegiste Nexus hoy?"),
      required: true,
      options: NEXUS_REASON_OPTIONS,
      visibleWhen: {
        mode: "all",
        conditions: [{ questionId: "core_product", operator: "equals", value: "nexus" }],
      },
    },
    {
      id: "discovery_source",
      kind: "single_choice",
      title: t("Where did you first hear about Harbor Innovations?", "Wo haben Sie zum ersten Mal von Harbor Innovations gehört?", "¿Dónde conociste Harbor Innovations por primera vez?"),
      required: true,
      options: DISCOVERY_OPTIONS,
    },
    {
      id: "purchase_barrier",
      kind: "single_choice",
      title: t("What almost stopped you from buying?", "Was hätte Sie beinahe vom Kauf abgehalten?", "¿Qué estuvo a punto de impedirte comprar?"),
      required: true,
      options: BARRIER_OPTIONS,
    },
    commonEnd,
  ],
};

export const PRODUCT_BARRIER_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-product-page-barrier",
  version: 1,
  slug: "product-page-barrier",
  internalName: "Product page purchase barrier",
  category: "purchase_barrier",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("Can we help?", "Können wir helfen?", "¿Podemos ayudarte?"),
  questions: [
    {
      id: "barrier",
      kind: "single_choice",
      title: t("What is holding you back from purchasing today?", "Was hält Sie heute vom Kauf ab?", "¿Qué te impide comprar hoy?"),
      required: true,
      options: BARRIER_OPTIONS.filter((option) => option.id !== "nothing"),
    },
    {
      id: "detail",
      kind: "long_text",
      title: t("What would help you decide?", "Was würde Ihnen bei der Entscheidung helfen?", "¿Qué te ayudaría a decidir?"),
      maxLength: 1000,
      placeholder: t("Optional details", "Optionale Details", "Detalles opcionales"),
    },
    commonEnd,
  ],
};

export const CART_EXIT_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-cart-exit",
  version: 1,
  slug: "cart-exit",
  internalName: "Cart exit survey",
  category: "cart_exit",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("Before you go", "Bevor Sie gehen", "Antes de irte"),
  questions: [
    {
      id: "exit_reason",
      kind: "single_choice",
      title: t("What is stopping you from checking out?", "Was hält Sie vom Bezahlen ab?", "¿Qué te impide finalizar la compra?"),
      required: true,
      options: CART_EXIT_OPTIONS,
    },
    {
      id: "detail",
      kind: "short_text",
      title: t("Anything else we should know?", "Gibt es noch etwas, das wir wissen sollten?", "¿Hay algo más que debamos saber?"),
      maxLength: 300,
      placeholder: t("Optional", "Optional", "Opcional"),
    },
    commonEnd,
  ],
};

export const ABANDONED_CART_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-abandoned-cart",
  version: 1,
  slug: "abandoned-cart",
  internalName: "Abandoned cart follow-up",
  category: "abandoned_cart",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("Help us improve checkout", "Helfen Sie uns, den Checkout zu verbessern", "Ayúdanos a mejorar el proceso de compra"),
  questions: [
    {
      id: "welcome",
      kind: "welcome",
      title: t("We noticed you did not complete your order", "Wir haben bemerkt, dass Sie Ihre Bestellung nicht abgeschlossen haben", "Vimos que no completaste tu pedido"),
      description: t("One answer helps us understand why.", "Eine Antwort hilft uns, den Grund zu verstehen.", "Una respuesta nos ayuda a entender el motivo."),
      buttonLabel: t("Continue", "Weiter", "Continuar"),
    },
    {
      id: "abandon_reason",
      kind: "single_choice",
      title: t("What was the main reason?", "Was war der Hauptgrund?", "¿Cuál fue el motivo principal?"),
      required: true,
      options: CART_EXIT_OPTIONS,
    },
    {
      id: "return_intent",
      kind: "single_choice",
      title: t("Are you still considering this purchase?", "Ziehen Sie diesen Kauf noch in Betracht?", "¿Sigues considerando esta compra?"),
      options: [
        { id: "yes", label: t("Yes", "Ja", "Sí") },
        { id: "maybe", label: t("Maybe", "Vielleicht", "Tal vez") },
        { id: "no", label: t("No", "Nein", "No") },
      ],
    },
    commonEnd,
  ],
};

export const POST_DELIVERY_NPS_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-post-delivery-nps",
  version: 1,
  slug: "post-delivery-nps",
  internalName: "Post-delivery NPS",
  category: "post_delivery_nps",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("How are we doing?", "Wie machen wir uns?", "¿Cómo lo estamos haciendo?"),
  questions: [
    {
      id: "welcome",
      kind: "welcome",
      title: t("How is your Harbor experience so far?", "Wie ist Ihre bisherige Erfahrung mit Harbor?", "¿Cómo ha sido tu experiencia con Harbor hasta ahora?"),
      buttonLabel: t("Share feedback", "Feedback geben", "Compartir opinión"),
    },
    {
      id: "nps",
      kind: "nps",
      title: t("How likely are you to recommend Harbor Innovations?", "Wie wahrscheinlich ist es, dass Sie Harbor Innovations weiterempfehlen?", "¿Qué probabilidades hay de que recomiendes Harbor Innovations?"),
      required: true,
      lowLabel: t("Not at all likely", "Sehr unwahrscheinlich", "Nada probable"),
      highLabel: t("Extremely likely", "Sehr wahrscheinlich", "Muy probable"),
    },
    {
      id: "improvement",
      kind: "long_text",
      title: t("What could we improve?", "Was könnten wir verbessern?", "¿Qué podríamos mejorar?"),
      maxLength: 1000,
      visibleWhen: {
        mode: "all",
        conditions: [{ questionId: "nps", operator: "less_than_or_equal", value: 8 }],
      },
    },
    {
      id: "highlight",
      kind: "long_text",
      title: t("What did you value most?", "Was hat Ihnen am besten gefallen?", "¿Qué valoraste más?"),
      maxLength: 1000,
      visibleWhen: {
        mode: "all",
        conditions: [{ questionId: "nps", operator: "greater_than_or_equal", value: 9 }],
      },
    },
    commonEnd,
  ],
};

export const PRODUCT_SATISFACTION_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-product-satisfaction",
  version: 1,
  slug: "product-satisfaction",
  internalName: "Product satisfaction",
  category: "product_satisfaction",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("Product feedback", "Produktfeedback", "Opinión sobre el producto"),
  questions: [
    {
      id: "rating",
      kind: "star_rating",
      title: t("How would you rate your product?", "Wie würden Sie Ihr Produkt bewerten?", "¿Cómo valorarías tu producto?"),
      required: true,
      stars: 5,
    },
    {
      id: "csat",
      kind: "csat",
      title: t("How satisfied are you with the overall experience?", "Wie zufrieden sind Sie mit dem Gesamterlebnis?", "¿Qué tan satisfecho estás con la experiencia general?"),
      required: true,
      scale: 5,
      lowLabel: t("Very dissatisfied", "Sehr unzufrieden", "Muy insatisfecho"),
      highLabel: t("Very satisfied", "Sehr zufrieden", "Muy satisfecho"),
    },
    {
      id: "feedback",
      kind: "long_text",
      title: t("What should we keep or improve?", "Was sollten wir beibehalten oder verbessern?", "¿Qué deberíamos mantener o mejorar?"),
      maxLength: 1000,
      placeholder: t("Optional feedback", "Optionales Feedback", "Opinión opcional"),
    },
    commonEnd,
  ],
};

export const STANDALONE_SURVEY_TEMPLATE: SurveyDefinitionV1 = {
  schemaVersion: 1,
  id: "harbor-standalone",
  version: 1,
  slug: "standalone-survey",
  internalName: "Standalone survey",
  category: "standalone",
  defaultLocale: "en",
  enabledLocales: ["en", "de", "es"],
  title: t("Harbor Innovations survey", "Umfrage von Harbor Innovations", "Encuesta de Harbor Innovations"),
  description: t("We would value your feedback.", "Wir freuen uns über Ihr Feedback.", "Valoramos mucho tu opinión."),
  questions: [
    {
      id: "welcome",
      kind: "welcome",
      title: t("We would like to hear from you", "Wir möchten Ihre Meinung hören", "Nos gustaría conocer tu opinión"),
      buttonLabel: t("Start", "Starten", "Empezar"),
    },
    {
      id: "topic",
      kind: "single_choice",
      title: t("What would you like to tell us about?", "Worüber möchten Sie uns etwas mitteilen?", "¿Sobre qué te gustaría hablarnos?"),
      required: true,
      options: [
        { id: "product", label: t("Product", "Produkt", "Producto") },
        { id: "website", label: t("Website or checkout", "Website oder Checkout", "Sitio web o proceso de compra") },
        { id: "support", label: t("Customer support", "Kundensupport", "Atención al cliente") },
        { id: "other", label: t("Other", "Sonstiges", "Otro") },
      ],
    },
    {
      id: "feedback",
      kind: "long_text",
      title: t("Tell us more", "Erzählen Sie uns mehr", "Cuéntanos más"),
      required: true,
      minLength: 1,
      maxLength: 2000,
    },
    commonEnd,
  ],
};

/** Seed these as draft survey/version records; no placement should be enabled automatically. */
export const HARBOR_SURVEY_TEMPLATES: readonly SurveyDefinitionV1[] = [
  PURCHASE_MOTIVATION_TEMPLATE,
  PRODUCT_BARRIER_TEMPLATE,
  CART_EXIT_TEMPLATE,
  ABANDONED_CART_TEMPLATE,
  POST_DELIVERY_NPS_TEMPLATE,
  PRODUCT_SATISFACTION_TEMPLATE,
  STANDALONE_SURVEY_TEMPLATE,
] as const;

export function getHarborSurveyTemplate(idOrSlug: string): SurveyDefinitionV1 | null {
  return HARBOR_SURVEY_TEMPLATES.find(
    (template) => template.id === idOrSlug || template.slug === idOrSlug,
  ) ?? null;
}
