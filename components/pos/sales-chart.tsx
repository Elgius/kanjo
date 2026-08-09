"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  today: {
    label: "Today",
    color: "var(--chart-1)",
  },
  lastWeek: {
    label: "Last week",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

export function SalesChart({
  data,
}: {
  data: Array<{ time: string; today: number; lastWeek: number }>;
}) {
  return (
    <ChartContainer
      config={chartConfig}
      className="h-[235px] w-full justify-start aspect-auto"
      initialDimension={{ width: 674, height: 235 }}
      role="img"
      aria-label="Hourly sales today compared with the same day last week."
    >
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="time"
          axisLine={false}
          tickLine={false}
          tickMargin={14}
          interval={2}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Line
          type="linear"
          dataKey="lastWeek"
          stroke="var(--color-lastWeek)"
          strokeWidth={2}
          strokeDasharray="6 6"
          dot={false}
        />
        <Line
          type="linear"
          dataKey="today"
          stroke="var(--color-today)"
          strokeWidth={4}
          dot={false}
          activeDot={{ r: 5, fill: "var(--color-today)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
