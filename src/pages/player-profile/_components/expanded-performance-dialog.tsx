import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Badge } from "@/components/ui/badge.tsx";

interface ChartDataPoint {
  name: string;
  placement: number;
  kills: number;
  kd: number;
  score: number;
  date: string;
}

interface ExpandedPerformanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chartType: "placement" | "kills";
  allChartData: ChartDataPoint[];
}

export default function ExpandedPerformanceDialog({
  open,
  onOpenChange,
  chartType,
  allChartData,
}: ExpandedPerformanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {chartType === "placement" 
                ? "Placement Trend - All Events" 
                : "Eliminations - All Events"}
            </span>
            <Badge variant="secondary" className="text-xs">
              {allChartData.length} events
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
        <div className="py-4">
          {chartType === "placement" ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={allChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  reversed
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "Placement", angle: -90, position: "insideLeft" }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px"
                  }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ChartDataPoint;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold text-sm mb-2">{data.name}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Date:</span>
                              <span className="font-medium">{data.date}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Placement:</span>
                              <span className="font-bold text-primary">#{data.placement}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Score:</span>
                              <span className="font-medium">{data.score}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Kills:</span>
                              <span className="font-medium">{data.kills}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="placement" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={allChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "Eliminations", angle: -90, position: "insideLeft" }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px"
                  }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ChartDataPoint;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold text-sm mb-2">{data.name}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Date:</span>
                              <span className="font-medium">{data.date}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Kills:</span>
                              <span className="font-bold text-primary">{data.kills}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Placement:</span>
                              <span className="font-medium">#{data.placement}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Score:</span>
                              <span className="font-medium">{data.score}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="kills" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        
        <div className="text-xs text-muted-foreground text-center pb-2">
          Click and drag to zoom • Scroll to pan
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
