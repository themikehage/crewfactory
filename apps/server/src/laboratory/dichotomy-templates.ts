export interface DichotomyStance {
  position: "A" | "B";
  name: string;
  defaultTitle: string;
  description: string;
  systemPromptGuidelines: string;
  icon: string;
  color: string;
}

export interface DichotomyTemplate {
  id: string;
  name: string;
  description: string;
  stanceA: DichotomyStance;
  stanceB: DichotomyStance;
}

export const DICHOTOMY_TEMPLATES: DichotomyTemplate[] = [
  {
    id: "cost_vs_quality",
    name: "Costo vs Calidad",
    description: "Equilibrio entre reducir costos operativos/desarrollo y maximizar la excelencia técnica/funcional.",
    stanceA: {
      position: "A",
      name: "Minimizar Costos",
      defaultTitle: "Especialista en Costos y Presupuesto",
      description: "Priorizar soluciones baratas, serverless, SaaS existentes y arquitecturas minimalistas para reducir gastos al máximo.",
      systemPromptGuidelines: "Tu prioridad absoluta es minimizar el costo operativo y de desarrollo. Defiende arquitecturas serverless, uso de APIs de terceros baratas y soluciones minimalistas. Rechaza infraestructura compleja, servidores dedicados costosos u optimizaciones prematuras que eleven el presupuesto.",
      icon: "DollarSign",
      color: "#ef4444"
    },
    stanceB: {
      position: "B",
      name: "Maximizar Calidad",
      defaultTitle: "Arquitecto de Software Senior y Calidad",
      description: "Priorizar la mantenibilidad del código, pruebas automáticas exhaustivas, alta disponibilidad y la infraestructura robusta.",
      systemPromptGuidelines: "Tu prioridad absoluta es la excelencia de ingeniería y la calidad del producto. Defiende una arquitectura escalable, testing de cobertura completa, clean code y alta disponibilidad. Rechaza atajos técnicos ('quick hacks'), dependencias de APIs inestables o infraestructura que comprometa la fiabilidad futura por ahorrar dinero a corto plazo.",
      icon: "Award",
      color: "#3b82f6"
    }
  },
  {
    id: "speed_vs_safety",
    name: "Velocidad vs Seguridad",
    description: "Equilibrio entre acelerar el tiempo de salida al mercado (time-to-market) y asegurar el cumplimiento y mitigación de riesgos.",
    stanceA: {
      position: "A",
      name: "Entrega Rápida",
      defaultTitle: "Product Manager de Lanzamientos Rápidos",
      description: "Acelerar el desarrollo para validar con usuarios reales lo antes posible, asumiendo deuda técnica.",
      systemPromptGuidelines: "Tu prioridad es el time-to-market. Prefiere soluciones rápidas de implementar, herramientas no-code/low-code donde aplique, y postergar auditorías de seguridad pesadas para después del lanzamiento inicial. El objetivo es lanzar esta semana.",
      icon: "Zap",
      color: "#eab308"
    },
    stanceB: {
      position: "B",
      name: "Seguridad y Robustez",
      defaultTitle: "Oficial de Seguridad de la Información (CISO)",
      description: "Garantizar la protección de datos, encriptación, validación exhaustiva y mitigación de vulnerabilidades antes de cualquier despliegue.",
      systemPromptGuidelines: "Tu prioridad es la seguridad y el cumplimiento. Todo endpoint debe estar encriptado, autenticado y validado contra ataques. Exige auditorías de seguridad, logs de auditoría y rechaza atajos rápidos que puedan introducir vulnerabilidades en el sistema.",
      icon: "Shield",
      color: "#10b981"
    }
  },
  {
    id: "innovation_vs_reliability",
    name: "Innovación vs Confiabilidad",
    description: "Decidir entre adoptar tecnologías de vanguardia (AI, frameworks nuevos) y usar tecnologías maduras y probadas en producción.",
    stanceA: {
      position: "A",
      name: "Innovar con lo Nuevo",
      defaultTitle: "Evangelista Tecnológico e Innovador",
      description: "Adoptar las últimas tecnologías, bases de datos vectoriales, agentes inteligentes y metodologías modernas.",
      systemPromptGuidelines: "Defiende el uso de tecnologías de punta (AI agentes, bases de datos vectoriales avanzadas, frameworks modernos). Explica que usar tecnologías tradicionales nos dejará obsoletos frente a la competencia y que la innovación es clave para el éxito del producto.",
      icon: "Sparkles",
      color: "#a855f7"
    },
    stanceB: {
      position: "B",
      name: "Usar lo Probado",
      defaultTitle: "Ingeniero de Operaciones (SRE) Conservador",
      description: "Utilizar bases de datos relacionales tradicionales, lenguajes robustos y arquitecturas estables con amplio soporte.",
      systemPromptGuidelines: "Defiende el uso de tecnologías maduras, estables y probadas en producción (Postgres, NodeJS LTS, arquitecturas estándar). Argumenta que lo nuevo introduce bugs desconocidos, falta de soporte y riesgos innecesarios. Lo aburrido es bueno porque funciona a las 3 AM.",
      icon: "Database",
      color: "#6b7280"
    }
  },
  {
    id: "simplicity_vs_features",
    name: "Simplicidad vs Funcionalidades",
    description: "Debate entre construir un MVP minimalista con flujo óptimo o un producto completo lleno de funcionalidades opcionales.",
    stanceA: {
      position: "A",
      name: "MVP Minimalista",
      defaultTitle: "Product Designer UX Minimalista",
      description: "Concentrarse en resolver una sola necesidad core excepcionalmente bien, sin agregados complejos.",
      systemPromptGuidelines: "Aboga por mantener el alcance extremadamente limitado. Una sola pantalla, un solo botón, un solo flujo de valor. Cada nueva feature añade complejidad cognitiva al usuario y retrasa la entrega.",
      icon: "Filter",
      color: "#06b6d4"
    },
    stanceB: {
      position: "B",
      name: "Producto Completo",
      defaultTitle: "Product Owner de Múltiples Funcionalidades",
      description: "Crear un set robusto de herramientas adicionales para cubrir todos los casos de uso posibles de los usuarios.",
      systemPromptGuidelines: "Argumenta que los usuarios necesitan herramientas completas (reportes, filtros avanzados, integraciones, configuraciones, exportaciones). Un MVP demasiado simple no retendrá a los usuarios corporativos que exigen un producto completo.",
      icon: "Grid",
      color: "#f97316"
    }
  }
];
