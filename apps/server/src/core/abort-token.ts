export class AbortToken {
  private controllers: Array<{ abort: () => void; label: string }> = [];
  private parentListener?: () => void;
  private parentSignal?: AbortSignal;
  aborted = false;

  constructor(parentSignal?: AbortSignal, label = "root") {
    this.parentSignal = parentSignal;
    if (parentSignal) {
      if (parentSignal.aborted) {
        this.abortAll();
        return;
      }
      this.parentListener = () => this.abortAll();
      parentSignal.addEventListener("abort", this.parentListener, { once: true });
    }
  }

  /**
   * Registrar una función de limpieza o de cancelación.
   * Si el token ya fue abortado, se ejecuta inmediatamente.
   */
  register(abort: () => void, label: string): void {
    if (this.aborted) {
      try {
        abort();
      } catch (err) {
        console.error(`[AbortToken] Immediate execution failed for "${label}":`, err);
      }
      return;
    }
    this.controllers.push({ abort, label });
  }

  /**
   * Cancela todo el árbol registrado en orden LIFO.
   */
  abortAll(): void {
    if (this.aborted) return;
    this.aborted = true;

    if (this.parentListener && this.parentSignal) {
      this.parentSignal.removeEventListener("abort", this.parentListener);
      this.parentListener = undefined;
    }

    // Ejecutar todos los controladores en orden inverso (LIFO)
    for (const controller of [...this.controllers].reverse()) {
      try {
        controller.abort();
      } catch (err) {
        console.error(`[AbortToken] Error aborting "${controller.label}":`, err);
      }
    }
    this.controllers = [];
  }
}
