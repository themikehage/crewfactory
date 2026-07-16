---
name: e2e-testing
description: Design and implement end-to-end tests for web applications verifying main user journeys. Use when planning and defining test coverage.
---

# Pruebas End-to-End (E2E Testing)

Esta habilidad proporciona pautas para estructurar un plan de pruebas integral de flujos de usuario completos, asegurando la calidad funcional del producto.

## Directrices para el Agente

### 1. Definición del Plan de Pruebas
- Identifica las rutas críticas de usuario (p. ej., Registro → Login → Crear Proyecto → Configurar Proyecto → Ejecutar).
- Define pre-condiciones, pasos de ejecución del usuario y resultados esperados claros para cada caso de prueba.

### 2. Aserciones y Calidad
- Escribe pruebas que verifiquen tanto los caminos felices (happy paths) como los casos de error (p. ej., formularios con datos inválidos, accesos no autorizados).
- Documenta las pruebas detallando cada escenario evaluado, facilitando el diagnóstico rápido de regresiones.
