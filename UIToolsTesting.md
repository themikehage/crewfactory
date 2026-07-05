# Manual de Pruebas de Herramientas Interactivas (AG-UI Protocol)

Este documento contiene instrucciones y prompts optimizados para probar los componentes interactivos de la interfaz de chat en **CrewFactory**.

---

## 1. Aprobación de Acciones (`request_approval`)
Se utiliza para requerir una confirmación explícita del usuario antes de que el agente ejecute comandos bash peligrosos, borre archivos o realice despliegues.

* **Prompt de prueba:**
  > `"Simulá que vas a desplegar la base de datos de producción a la versión v3 y pedime aprobación usando request_approval antes de hacer nada."`
* **Qué verificar:**
  * Debe aparecer una tarjeta con título, descripción y botones de **Confirmar** y **Cancelar**.
  * Al hacer clic en **Confirmar**, el estado del botón debe cambiar a `"Confirmado"` (badge verde) y la consola debe mostrar la simulación del despliegue exitoso una sola vez.

---

## 2. Comparador de Código Interactiva (`propose_code_change`)
Muestra un Diff visual interactivo (línea por línea con colores) antes de aplicar cambios en archivos del workspace.

* **Prompt de prueba:**
  > `"Proponeme un cambio de código para agregar una función suma() en un archivo test.ts utilizando la herramienta propose_code_change."`
* **Qué verificar:**
  * Debe renderizar una tarjeta con la ruta del archivo y una tabla de diff (las líneas agregadas en verde con el símbolo `+`).
  * Debe tener los botones **Aplicar cambio** y **Descartar**.
  * Si hacés clic en **Aplicar cambio**, debe crearse o modificarse el archivo `test.ts` en el workspace de CrewFactory y el componente debe mostrar el badge de `"Aplicado"`.

---

## 3. Tarjeta de Galería Multimedia (`render_media_card`)
Renderiza una tarjeta premium para imágenes o mockups generados por IA, incluyendo acciones rápidas para regenerar o crear variaciones.

* **Prompt de prueba:**
  > `"Simulá que generaste una imagen de un logotipo para CrewFactory y mostrame el resultado en una tarjeta multimedia usando la herramienta render_media_card con el prompt original."`
* **Qué verificar:**
  * Debe renderizarse la imagen en una tarjeta estilizada con el prompt visible.
  * Debe mostrar dos botones de acción rápida: **Regenerar** y **Variaciones**.
  * Al hacer clic en cualquiera de estos botones, el chat debe enviar automáticamente un prompt al agente para realizar la acción seleccionada sin que tengas que escribir.

---

## 4. Formulario Dinámico de Entrada (`request_form_input`)
Solicita datos estructurados al usuario de forma segura (ej. tokens de API, credenciales de base de datos) usando un formulario nativo en vez de texto plano.

* **Prompt de prueba:**
  > `"Pedime las credenciales para configurar una base de datos PostgreSQL en la nube utilizando la herramienta request_form_input con campos para Host, Puerto, Usuario, y Password."`
* **Qué verificar:**
  * Debe renderizarse un formulario interactivo con campos etiquetados.
  * El campo de Password debe enmascarar los caracteres.
  * El formulario debe validar que no envíes campos obligatorios vacíos.
  * Al hacer clic en **Enviar**, el agente debe recibir el payload con los datos estructurados en el backend.

---

## 5. Panel de Configuración de Agentes (`configure_agent_card`)
Abre un panel en el chat para calibrar a un agente en vivo (cambiar su modelo LLM o editar su prompt de sistema).

* **Prompt de prueba:**
  > `"Mostrame la tarjeta interactiva configure_agent_card para calibrar al agente 'supervisor'."`
* **Qué verificar:**
  * Debe mostrar un spinner de carga mientras consulta la API del agente.
  * Debe cargar los datos reales del agente 'supervisor', un selector con todos los modelos de IA disponibles y un textarea con su system prompt.
  * Al guardar los cambios, el componente enviará el payload con el nuevo modelo y prompt seleccionados.

---

## 6. Gráficos Interactivos (`render_chart`)
Renderiza gráficos de barra, línea, área o torta con animaciones utilizando la librería Recharts de forma nativa.

* **Prompt de prueba:**
  > `"Mostrame un gráfico de barras con las ventas del primer trimestre (Ene: 150, Feb: 230, Mar: 180) usando la herramienta render_chart."`
* **Qué verificar:**
  * Debe renderizarse un gráfico de barras animado, responsivo y adaptado al tema oscuro de CrewFactory.
