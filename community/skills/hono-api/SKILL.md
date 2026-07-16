---
name: hono-api
description: Build serverless or Node.js APIs using Hono framework with routing, middleware, and request validation. Use when developing backend routers and API endpoints.
---

# Desarrollo de APIs con Hono (Hono API Development)

Esta habilidad proporciona pautas para construir servidores y rutas REST/WS con Hono, integrando validación Zod de manera limpia y profesional.

## Directrices para el Agente

### 1. Enrutamiento y Estructura
- Define las rutas agrupadas lógicamente por recurso (p. ej., `/api/auth`, `/api/users`, `/api/projects`).
- Utiliza la separación de controladores: mantén los middlewares y validadores desacoplados de los handlers principales.

### 2. Validaciones con Zod
- Valida los cuerpos de las peticiones (`req.json()`) y los parámetros de consulta (`req.query()`) de forma estricta.
- Ejemplo de middleware de validación:
  ```typescript
  import { zValidator } from '@hono/zod-validator'
  import { z } from 'zod'

  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })

  app.post('/user', zValidator('json', schema), (c) => {
    const data = c.req.valid('json')
    return c.json({ success: true, data })
  })
  ```
- Devuelve mensajes de error amigables en caso de fallos de validación (400 Bad Request).
