# Prompts de Ejemplo para Experimentos de Laboratorio

Este documento contiene una lista de prompts diseñados específicamente para probar y comparar el comportamiento de las variantes en el Laboratorio de Benchmarking Multivariable de CrewFactory.

---

## 1. Campaña de Lanzamiento de Producto (Copywriting & Posicionamiento)
* **Objetivo de Prueba**: Evaluar la integración de estilos creativos y la convergencia en copys de alta conversión.
* **Prompt**:
  ```text
  Diseña la sección Hero de la landing page para el lanzamiento de 'AuraRing Mini', un anillo inteligente que mide los niveles de estrés en tiempo real. Necesitamos el headline principal, el copy de propuesta de valor con 3 beneficios emocionales, y la llamada a la acción (CTA) para la preventa. El tono debe ser premium y empático.
  ```
* **Indicadores clave a observar**:
  * **Variante Horizontal**: Observar si los redactores (Titulares, Beneficios, CTA) se integran de manera lógica o si surgen discusiones redundantes sobre la combinación del copy.
  * **Variante Jerárquica**: Verificar que el Director Creativo lidere el proceso, asigne las tareas, evalúe las propuestas y compile un entregable integrado sin loops.

---

## 2. Estimación y Arquitectura de Software (Negociación Técnica)
* **Objetivo de Prueba**: Evaluar la resolución de conflictos técnicos de diseño y estimaciones bajo restricciones de tiempo y seguridad.
* **Prompt**:
  ```text
  Define la arquitectura de alto nivel y la estrategia de migración para pasar un sistema de facturación monolítico heredado a microservicios en AWS. Queremos minimizar el tiempo de inactividad de la base de datos y garantizar el cumplimiento de normativas de seguridad bancarias. Propón las fases de desarrollo y la estimación de esfuerzo en semanas.
  ```
* **Indicadores clave a observar**:
  * **Variante Horizontal**: Ver cómo debaten el Arquitecto de Software y el Ingeniero de Seguridad sin un mediador.
  * **Variante Jerárquica**: Ver cómo el Tech Lead (líder) arbitra el conflicto entre la velocidad que propone el arquitecto y las trabas que impone el especialista de seguridad para consolidar una estimación definitiva.

---

## 3. Plan de Comunicación en Crisis de Relaciones Públicas (Gestión de PR)
* **Objetivo de Prueba**: Medir la capacidad de mitigación de daños y negociación bajo posturas opuestas de negocio y legales.
* **Prompt**:
  ```text
  Redacta el borrador del comunicado oficial de disculpas y el plan de mitigación inmediato de 3 puntos tras una brecha de seguridad que expuso los correos electrónicos del 15% de nuestros usuarios. El tono debe proyectar responsabilidad institucional y calma, protegiendo a la empresa legalmente sin sonar fría.
  ```
* **Indicadores clave a observar**:
  * **Variante Horizontal**: Analizar si el tono resultante oscila incoherentemente entre lo formal/defensivo y lo transparente/abierto.
  * **Variante Jerárquica**: Observar cómo el Director de PR balancea las posturas rígidas de la asesoría legal con la apertura exigida por el especialista de atención al cliente.
