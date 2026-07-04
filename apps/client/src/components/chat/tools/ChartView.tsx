import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Props {
  chartType?: "bar" | "line" | "pie" | "area";
  type?: "bar" | "line" | "pie" | "area";
  title?: string;
  data?: Array<{ label: string; value: number; [key: string]: any }>;
  labels?: string[];
  datasets?: Array<{ label: string; data: number[] }>;
  config?: {
    stacked?: boolean;
    colors?: string[];
    xLabel?: string;
    yLabel?: string;
  };
}

// Colores por defecto elegantes compatibles con el tema oscuro/oklch de CrewFactory
const DEFAULT_COLORS = [
  "#4ade80", // accent (green)
  "#60a5fa", // primary (blue)
  "#fbbf24", // warning (amber)
  "#f472b6", // pink
  "#a78bfa", // purple
  "#22d3ee", // cyan
];

export function ChartView({
  chartType: propChartType,
  type,
  title,
  data: propData,
  labels,
  datasets,
  config = {},
}: Props) {
  // Normalize chartType
  const chartType = (propChartType || type || "bar") as "bar" | "line" | "pie" | "area";
  const { stacked = false, colors = DEFAULT_COLORS, xLabel, yLabel } = config;

  // Normalize data (support standard data array or labels/datasets format)
  let data: Array<{ label: string; [key: string]: any }> = [];
  if (propData && Array.isArray(propData)) {
    data = propData;
  } else if (labels && Array.isArray(labels) && datasets && Array.isArray(datasets)) {
    data = labels.map((lbl, index) => {
      const row: { label: string; [key: string]: any } = { label: lbl };
      datasets.forEach((ds) => {
        const val = ds.data[index] ?? 0;
        row[ds.label || "value"] = val;
        if (datasets.length === 1) {
          row["value"] = val;
        }
      });
      return row;
    });
  }

  // Renderizar el gráfico adecuado según el tipo
  const renderChart = () => {
    // Si los datos son vacíos, no renderizar nada
    if (!data || data.length === 0) {
      return (
        <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
          Sin datos para mostrar
        </div>
      );
    }

    // Averiguar las claves numéricas dinámicas para las variables del gráfico
    const sample = data[0] || {};
    const dataKeys = Object.keys(sample).filter(
      (k) => k !== "label" && typeof sample[k] === "number"
    );

    // Si no se encuentran claves numéricas, usar la primera propiedad numérica o "value" por defecto
    const keysToRender = dataKeys.length > 0 ? dataKeys : ["value"];

    switch (chartType) {
      case "line":
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis
              dataKey="label"
              stroke="#a2a2a2"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5, fill: "#a2a2a2", fontSize: 10 } : undefined}
            />
            <YAxis
              stroke="#a2a2a2"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", offset: 10, fill: "#a2a2a2", fontSize: 10 } : undefined}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#171717", borderColor: "#313131", borderRadius: "8px" }}
              itemStyle={{ fontSize: "11px" }}
              labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#e2e8f0" }}
            />
            {keysToRender.length > 1 && <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />}
            {keysToRender.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2.5}
                activeDot={{ r: 6 }}
                dot={{ r: 4 }}
                animationDuration={800}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {keysToRender.map((key, index) => {
                const color = colors[index % colors.length];
                return (
                  <linearGradient key={`grad-${key}`} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" stroke="#a2a2a2" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#a2a2a2" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#171717", borderColor: "#313131", borderRadius: "8px" }}
              itemStyle={{ fontSize: "11px" }}
              labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#e2e8f0" }}
            />
            {keysToRender.length > 1 && <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />}
            {keysToRender.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                fill={`url(#grad-${key})`}
                strokeWidth={2}
                stackId={stacked ? "1" : undefined}
                animationDuration={800}
              />
            ))}
          </AreaChart>
        );

      case "pie":
        const pieKey = keysToRender[0] || "value";
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={65}
              paddingAngle={3}
              dataKey={pieKey}
              nameKey="label"
              animationDuration={800}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#171717", borderColor: "#313131", borderRadius: "8px" }}
              itemStyle={{ fontSize: "11px" }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} layout="horizontal" verticalAlign="bottom" align="center" />
          </PieChart>
        );

      case "bar":
      default:
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" stroke="#a2a2a2" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#a2a2a2" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#171717", borderColor: "#313131", borderRadius: "8px" }}
              itemStyle={{ fontSize: "11px" }}
              labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#e2e8f0" }}
            />
            {keysToRender.length > 1 && <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />}
            {keysToRender.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
                stackId={stacked ? "1" : undefined}
                animationDuration={800}
              />
            ))}
          </BarChart>
        );
    }
  };

  return (
    <div className="w-full bg-card/45 border border-input/40 rounded-xl p-4 shadow-md font-sans my-3">
      {title && (
        <h4 className="text-xs font-bold text-foreground mb-3 text-left border-l-2 border-primary pl-2">
          {title}
        </h4>
      )}
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
