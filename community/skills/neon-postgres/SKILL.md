---
name: neon-postgres
description: Design relational database schemas, write SQL queries, and configure serverless connection to Neon Postgres database. Use when designing schemas, databases, and writing SQL queries.
---

# Persistencia con Neon Postgres (Neon Postgres Integration)

Esta habilidad asiste en el diseño relacional y la optimización de consultas SQL cuando se utiliza la plataforma serverless de Neon Postgres.

## Directrices para el Agente

### 1. Diseño de Esquemas y Tablas
- Diseña bases de datos relacionales normalizadas (3NF por defecto), utilizando claves primarias/foráneas e índices apropiados para optimizar las lecturas.
- Prefiere el uso de UUIDs para identificadores sobre enteros autoincrementables en entornos distribuidos.

### 2. Conectividad en Servidores Serverless
- Configura el cliente utilizando el driver pooleado de Neon (`@neondatabase/serverless`) para optimizar las conexiones de corta duración en entornos edge.
- Maneja transacciones de forma segura para operaciones de inserción múltiple o actualización crítica.
- Implementa migraciones de base de datos controladas por versión y archivos SQL reproducibles.
