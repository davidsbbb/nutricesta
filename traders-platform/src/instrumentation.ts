import { assertSafeEnvironment } from "@/lib/env-guard";

// Segunda línea de defensa: se ejecuta una vez al iniciar cada instancia del
// servidor, antes de atender peticiones (por si alguien cambia el entorno en
// tiempo de ejecución sin volver a evaluar next.config.ts).
export function register() {
  assertSafeEnvironment();
}
