/**
 * Textos legales. TODOS son plantillas PENDIENTES DE REVISIÓN POR ABOGADO.
 * Las versiones deben coincidir con las filas de public.legal_documents
 * (migración 20260929000001_core.sql). Para publicar una versión nueva:
 * nueva migración que marque la anterior is_current=false e inserte la nueva,
 * y actualizar `version` aquí. Los usuarios tendrán que volver a aceptar.
 */

export const PENDING_REVIEW = "PENDIENTE DE REVISIÓN POR ABOGADO";

export const NOT_ADVICE =
  "Contenido educativo e informativo, no constituye asesoramiento financiero.";

export const PAST_PERFORMANCE =
  "Rentabilidades pasadas no garantizan resultados futuros.";

export type LegalKey =
  | "terminos"
  | "aviso_legal"
  | "privacidad"
  | "consentimiento_rgpd"
  | "no_asesoramiento"
  | "desistimiento";

export interface LegalDocument {
  key: LegalKey;
  version: string;
  title: string;
  /** Casilla que el usuario marca para aceptarlo. */
  checkboxLabel: string;
  body: string[];
}

const V = "2026-09-29-borrador";

export const LEGAL_DOCUMENTS: Record<LegalKey, LegalDocument> = {
  terminos: {
    key: "terminos",
    version: V,
    title: "Términos y condiciones",
    checkboxLabel: "He leído y acepto los Términos y condiciones.",
    body: [
      "Este es un entorno PRIVADO DE PRUEBAS con un máximo de tres usuarios invitados. No es un servicio de inversión ni un servicio abierto al público.",
      "La plataforma permite a creadores de contenido (\"traders\") publicar análisis, carteras y tesis de inversión de carácter GENERAL, idénticos para todos los suscriptores. No se presta asesoramiento personalizado, gestión de carteras ni recepción o transmisión de órdenes.",
      "Los traders no están necesariamente autorizados ni registrados ante la CNMV u otro supervisor. Nada de lo publicado constituye una recomendación personalizada.",
      "Queda prohibido solicitar o dar recomendaciones personalizadas en los comentarios, prometer rentabilidades y publicar contenido engañoso. La plataforma puede retirar contenido y suspender cuentas.",
      "Los pagos se procesan en modo de prueba de Stripe: no se mueve dinero real.",
      "[Plantilla: completar identidad del titular, ley aplicable, jurisdicción, responsabilidad, propiedad intelectual y procedimiento de reclamaciones.]",
    ],
  },
  aviso_legal: {
    key: "aviso_legal",
    version: V,
    title: "Aviso legal",
    checkboxLabel: "He leído el Aviso legal.",
    body: [
      "[Plantilla LSSI-CE: denominación social, NIF, domicilio, datos registrales y email de contacto del titular.]",
      `${NOT_ADVICE} ${PAST_PERFORMANCE}`,
      "La inversión en instrumentos financieros conlleva riesgos, incluida la pérdida total del capital invertido.",
    ],
  },
  privacidad: {
    key: "privacidad",
    version: V,
    title: "Política de privacidad",
    checkboxLabel: "He leído la Política de privacidad.",
    body: [
      "Responsable: [Plantilla: identidad y contacto del responsable y, en su caso, del DPD].",
      "Datos tratados (mínimos): email (para iniciar sesión), nombre visible, rol, aceptaciones legales, contenido que publiques y datos de suscripción de prueba. Traders: además NIF y país a efectos fiscales (DAC7) y extractos subidos para verificar su historial.",
      "Finalidades y bases jurídicas: prestar el servicio (ejecución del contrato), cumplimiento de obligaciones legales (fiscales, registro de auditoría) y consentimiento explícito cuando proceda.",
      "Encargados: Supabase (base de datos y autenticación) y Stripe (pagos, modo test). [Plantilla: ubicación de los datos y transferencias internacionales.]",
      "Derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad. Desde \"Mi cuenta\" puedes exportar tus datos y borrar tu cuenta. También puedes reclamar ante la AEPD.",
      "Conservación: mientras la cuenta esté activa. El registro de auditoría se conserva de forma seudonimizada (solo identificador interno) por obligación legal. [Plantilla: plazos concretos.]",
      "No usamos analítica, cookies publicitarias ni redes sociales. Solo cookies técnicas de sesión.",
    ],
  },
  consentimiento_rgpd: {
    key: "consentimiento_rgpd",
    version: V,
    title: "Consentimiento para el tratamiento de datos",
    checkboxLabel:
      "Consiento expresamente el tratamiento de mis datos para las finalidades descritas en la Política de privacidad.",
    body: [
      "Consientes de forma libre, específica, informada e inequívoca el tratamiento de tus datos personales descrito en la Política de privacidad.",
      "Puedes retirar tu consentimiento en cualquier momento borrando tu cuenta desde \"Mi cuenta\".",
    ],
  },
  no_asesoramiento: {
    key: "no_asesoramiento",
    version: V,
    title: "Contenido educativo, no asesoramiento financiero",
    checkboxLabel: `Entiendo que el ${NOT_ADVICE.charAt(0).toLowerCase()}${NOT_ADVICE.slice(1)}`,
    body: [
      NOT_ADVICE,
      "El contenido es general e igual para todos los suscriptores; no tiene en cuenta tu situación financiera, objetivos, conocimientos ni tolerancia al riesgo.",
      PAST_PERFORMANCE,
      "Antes de invertir, consulta con una entidad o asesor autorizado por la CNMV.",
    ],
  },
  desistimiento: {
    key: "desistimiento",
    version: V,
    title: "Información sobre el derecho de desistimiento",
    checkboxLabel:
      "He sido informado de mi derecho de desistimiento y de cómo cancelar la suscripción.",
    body: [
      "Como consumidor dispones de 14 días naturales desde la contratación para desistir sin necesidad de justificación.",
      "Si solicitas acceder al contenido de inmediato, [Plantilla: consecuencias sobre el derecho de desistimiento para contenido digital, art. 103.m TRLGDCU].",
      "Puedes cancelar la suscripción en cualquier momento desde \"Mis suscripciones\" con un solo clic; mantendrás el acceso hasta el final del periodo pagado.",
    ],
  },
};

export const REGISTRATION_DOCS: LegalKey[] = [
  "terminos",
  "aviso_legal",
  "privacidad",
  "consentimiento_rgpd",
  "no_asesoramiento",
];

export const SUBSCRIPTION_DOCS: LegalKey[] = [
  "terminos",
  "aviso_legal",
  "privacidad",
  "no_asesoramiento",
  "desistimiento",
];
