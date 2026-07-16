---
name: agent-browser
description: Use Agent Browser tool to interact with live web preview, click elements, fill forms, and take screenshots. Use this skill when executing active web tests and checking visual correctness.
---

# Navegación y Pruebas Visuales (Agent Browser Operation)

Esta habilidad instruye en la interacción mediante navegador automatizado (Playwright/Puppeteer/Agent Browser) para auditar aplicaciones web vivas.

## Directrices para el Agente

### 1. Interacción con el Navegador
- Asegura que el servidor de preview o la URL de destino esté levantada y respondiendo antes de iniciar las interacciones.
- Utiliza selectores estables (p. ej., `id`, `data-testid`, o textos unívocos) para interactuar con botones y campos.
- Controla los tiempos de espera de forma defensiva: implementa esperas explícitas para elementos asíncronos en lugar de esperas fijas (`sleep`).

### 2. Captura de Evidencias Visuales
- Toma capturas de pantalla (screenshots) en momentos clave de la navegación (p. ej., página principal cargada, modal abierto, mensaje de éxito visible).
- Si una prueba falla, captura una imagen inmediatamente y lee la consola de errores del navegador (`console.log`/`console.error`) para adjuntar detalles técnicos al reporte de bugs.
