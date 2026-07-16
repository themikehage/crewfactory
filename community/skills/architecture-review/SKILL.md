---
name: architecture-review
description: Review technical design, check API routes validation, and verify codebase architecture conventions. Use when reviewing code structure, patterns, and pull requests.
---

# Revisión de Arquitectura (Architecture Review)

Esta habilidad proporciona pautas para evaluar la calidad del código, la consistencia de los patrones arquitectónicos y la seguridad técnica general del proyecto.

## Directrices para el Agente

### 1. Principios de Diseño
- Fomenta la simplicidad: aboga por la separación clara de responsabilidades (p. ej., separar los handlers de las APIs de la lógica de persistencia o base de datos).
- Revisa que las APIs REST usen métodos HTTP adecuados (`GET`, `POST`, `PUT`, `DELETE`) y códigos de estado semánticos (200, 201, 400, 401, 403, 404, 500).

### 2. Estándares Técnicos
- **Tipado estricto:** Exige TypeScript estricto. Evita el uso de tipos implícitos o explícitos `any` a menos que sea estrictamente inevitable.
- **Validación robusta:** Toda API de entrada de datos debe contar con validación de esquemas (Zod o similar).
- **Manejo de errores:** Asegura que los bloques try-catch capturen errores de forma segura sin revelar información confidencial al usuario final.
