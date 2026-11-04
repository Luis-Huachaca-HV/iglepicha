import { useMemo } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

interface RatingRadarProps {
  stats?: Record<string, number>;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

const RATING_ATTRIBUTES = [
  { key: 'velocidad', label: 'Velocidad' },
  { key: 'fuerza', label: 'Fuerza' },
  { key: 'tecnica', label: 'Técnica' },
  { key: 'rematador', label: 'Rematador' },
  { key: 'defensa', label: 'Defensa' },
  { key: 'pase', label: 'Pase' },
  { key: 'posicionamiento', label: 'Posicionamiento' },
  { key: 'agresividad', label: 'Agresividad' },
  { key: 'consistencia', label: 'Consistencia' },
] as const;

export default function RatingRadar({ stats = {}, size = 'md', showLabels = true }: RatingRadarProps) {
  const sizeConfig = {
    sm: { height: 240, containerClass: 'w-full max-w-xs' },
    md: { height: 320, containerClass: 'w-full max-w-md' },
    lg: { height: 400, containerClass: 'w-full max-w-lg' },
  };

  const chartData = useMemo(() => {
    return RATING_ATTRIBUTES.map((attr) => ({
      name: attr.label,
      key: attr.key,
      value: Math.min(Math.max(stats[attr.key] || 0, 0), 10),
      fullMark: 10,
    }));
  }, [stats]);

  const averageRating = useMemo(() => {
    if (!chartData.length) return 0;
    const sum = chartData.reduce((acc, d) => acc + d.value, 0);
    return (sum / chartData.length).toFixed(1);
  }, [chartData]);

  const hasStats = chartData.some((d) => d.value > 0);

  if (!hasStats) {
    return (
      <div className={`${sizeConfig[size].containerClass} flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#2B4A3B] bg-[#18352A] p-6 text-center`}>
        <div className="text-sm font-medium text-[#B7C8BD]">Sin valoración registrada</div>
        <div className="text-xs text-[#B7C8BD]">Los nueve atributos aparecerán aquí una vez se registre una valoración.</div>
      </div>
    );
  }

  return (
    <div className={`${sizeConfig[size].containerClass} space-y-4`}>
      {/* Radar Chart */}
      <div className="rounded-2xl border border-[#2B4A3B] bg-[#10231D] p-4">
        <ResponsiveContainer width="100%" height={sizeConfig[size].height}>
          <RadarChart data={chartData} margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
            <PolarGrid
              stroke="#2B4A3B"
              strokeDasharray="0"
              radialLines={false}
            />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fill: '#B7C8BD', fontSize: 11 }}
              angle={90}
              domain={[0, 360]}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={{ fill: '#B7C8BD', fontSize: 10 }}
              tickLine={{ stroke: '#2B4A3B' }}
            />
            <Radar
              name="Valoración"
              dataKey="value"
              stroke="#F4B942"
              fill="#F4B942"
              fillOpacity={0.25}
              strokeWidth={2}
              dot={{ fill: '#F4B942', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      {showLabels && (
        <div className="space-y-3">
          {/* Promedio General */}
          <div className="flex items-center justify-between rounded-lg border border-[#2B4A3B] bg-[#18352A] px-4 py-3">
            <span className="text-sm font-medium text-[#B7C8BD]">Promedio</span>
            <span className="font-mono text-lg font-600 text-[#F4B942] tabular-nums">
              {averageRating}
            </span>
          </div>

          {/* Atributos Individuales */}
          <div className="space-y-2">
            {chartData.map((attr) => (
              <div key={attr.key} className="flex items-center justify-between rounded-lg bg-[#18352A] px-3 py-2">
                <span className="text-xs font-medium text-[#B7C8BD]">{attr.name}</span>
                <div className="flex items-center gap-2">
                  {/* Barra de progreso */}
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#2B4A3B]">
                    <div
                      className="h-full bg-[#F4B942] transition-all"
                      style={{ width: `${(attr.value / 10) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm font-600 text-[#F3F7F3] tabular-nums w-5 text-right">
                    {attr.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Línea táctica divisoria */}
          <div className="flex gap-1">
            <div className="h-px flex-1 bg-[#2B4A3B]" />
            <div className="h-px w-2 bg-[#F4B942]" />
            <div className="h-px flex-1 bg-[#2B4A3B]" />
          </div>
        </div>
      )}
    </div>
  );
}
