import { useEffect, useId, useMemo, useRef } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { getPaletteColor } from "@/lib/color-tokens"
import { useDatabaseViewContext } from "../database-view-context"
import {
  shouldSplitDatabaseChartSeries,
  type DatabaseChartReferenceLine,
} from "./database-chart-config"
import {
  DEFAULT_CHART_COLOR,
  createChartData,
  createOuterPieSegments,
  createSplitChartData,
  getChartGroupProperty,
  getChartMeasureValue,
  getChartValueColorKey,
  getColorVariant,
  getRandomChartColor,
  type DatabaseChartDataItem,
  type DatabaseChartSeriesItem,
} from "./database-chart-data"

export function DatabaseChartView() {
  const {
    chartSettings,
    filteredItems,
    personOptions,
    properties,
    propertyValuesByKey,
    updateDatabaseChartSettings,
  } = useDatabaseViewContext()
  const gradientId = useIdWithoutColons()
  const assignedColorKeysRef = useRef(new Set<string>())
  const personNamesById = useMemo(
    () => new Map(personOptions.map((person) => [person.id, person.name])),
    [personOptions],
  )
  const axisProperty = getChartGroupProperty(
    properties,
    chartSettings.groupByPropertyId,
  )
  const measureProperty =
    chartSettings.measurePropertyId === "count"
      ? null
      : properties.find(
          (property) =>
            property.property.id === chartSettings.measurePropertyId,
        ) ?? null
  const splitProperty =
    chartSettings.splitByPropertyId &&
    chartSettings.splitByPropertyId !== "name"
      ? properties.find(
          (property) =>
            property.property.id === chartSettings.splitByPropertyId,
        ) ?? null
      : null
  const shouldSplitSeries = shouldSplitDatabaseChartSeries({
    axisPropertyId: axisProperty?.property.id,
    splitPropertyId: splitProperty?.property.id,
    type: chartSettings.type,
  })
  const chartData = useMemo(
    () =>
      createChartData({
        groupByPropertyId: chartSettings.groupByPropertyId,
        hiddenGroupNames: chartSettings.hiddenGroupNames,
        measurePropertyId: chartSettings.measurePropertyId,
        omitZeroValues: chartSettings.omitZeroValues,
        personNamesById,
        properties,
        propertyValuesByKey,
        rows: filteredItems,
        sort: chartSettings.sort,
        valueColors: chartSettings.valueColors,
      }),
    [
      chartSettings.groupByPropertyId,
      chartSettings.hiddenGroupNames,
      chartSettings.measurePropertyId,
      chartSettings.omitZeroValues,
      chartSettings.sort,
      chartSettings.valueColors,
      filteredItems,
      personNamesById,
      properties,
      propertyValuesByKey,
    ],
  )
  const splitChart = useMemo(
    () =>
      splitProperty && shouldSplitSeries
        ? createSplitChartData({
            axisProperty,
            dateInterval: chartSettings.splitByDateInterval,
            hiddenGroupNames: chartSettings.hiddenGroupNames,
            measureProperty,
            omitZeroValues: chartSettings.omitZeroValues,
            personNamesById,
            propertyValuesByKey,
            rows: filteredItems,
            sort: chartSettings.sort,
            splitProperty,
            valueColors: chartSettings.valueColors,
          })
        : { data: chartData, series: [] },
    [
      axisProperty,
      chartData,
      chartSettings.omitZeroValues,
      chartSettings.hiddenGroupNames,
      chartSettings.sort,
      chartSettings.splitByDateInterval,
      chartSettings.valueColors,
      filteredItems,
      measureProperty,
      personNamesById,
      propertyValuesByKey,
      shouldSplitSeries,
      splitProperty,
    ],
  )
  const displayChartData = shouldSplitSeries ? splitChart.data : chartData
  const chartSeries = splitChart.series
  const outerPieSegments = useMemo(
    () =>
      chartSettings.type === "pie" && shouldSplitSeries
        ? createOuterPieSegments(splitChart.data, chartSeries)
        : [],
    [chartSeries, chartSettings.type, shouldSplitSeries, splitChart.data],
  )
  const missingValueColorKeys = useMemo(() => {
    const colorProperty = shouldSplitSeries ? splitProperty : axisProperty
    const configuredOptions = colorProperty
      ? new Map(
          getConfiguredChartOptions(colorProperty).map((option) => [
            option.name,
            option.color,
          ]),
        )
      : new Map<string, string | undefined>()
    const labels = shouldSplitSeries
      ? chartSeries.map((series) => series.label)
      : chartData.map((item) => item.name)

    return labels.flatMap((label) => {
      if (label === "True" || label === "False") {
        return []
      }

      const optionColor = configuredOptions.get(label)
      const colorKey = getChartValueColorKey(colorProperty, label)

      return (!optionColor || optionColor === "default") &&
        !chartSettings.valueColors[colorKey] &&
        !assignedColorKeysRef.current.has(colorKey)
        ? [colorKey]
        : []
    })
  }, [
    axisProperty,
    chartData,
    chartSeries,
    chartSettings.valueColors,
    shouldSplitSeries,
    splitProperty,
  ])

  useEffect(() => {
    if (missingValueColorKeys.length === 0) {
      return
    }

    const nextValueColors = { ...chartSettings.valueColors }

    for (const colorKey of missingValueColorKeys) {
      assignedColorKeysRef.current.add(colorKey)
      nextValueColors[colorKey] = getRandomChartColor()
    }

    updateDatabaseChartSettings({ valueColors: nextValueColors })
  }, [
    chartSettings.valueColors,
    missingValueColorKeys,
    updateDatabaseChartSettings,
  ])

  if (displayChartData.length === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No rows to chart
      </div>
    )
  }

  const metricLabel =
    measureProperty?.property.name?.trim() || "Task count"
  const allowMeasureDecimals = measureProperty?.property.type === "number"
  const selectedColor =
    chartSettings.color === "auto"
      ? null
      : getPaletteColor(chartSettings.color) ?? DEFAULT_CHART_COLOR
  const getDisplayColor = (item: DatabaseChartDataItem, index = 0) =>
    selectedColor ? getColorVariant(selectedColor, index) : item.color
  const getSeriesDisplayColor = (
    series: DatabaseChartSeriesItem,
    index = 0,
  ) => (selectedColor ? getColorVariant(selectedColor, index) : series.color)
  const chartConfig = Object.fromEntries([
    [
      "count",
      {
        color: DEFAULT_CHART_COLOR,
        label: metricLabel,
      },
    ],
    ...chartSeries.map((series, index) => [
      series.key,
      {
        color: getSeriesDisplayColor(series, index),
        label: series.label,
      },
    ]),
  ]) satisfies ChartConfig
  const numericDomain: [number | "auto", number | "auto"] = [
    chartSettings.rangeMin ?? "auto",
    chartSettings.rangeMax ?? "auto",
  ]
  const hasCustomRange =
    chartSettings.rangeMin !== undefined ||
    chartSettings.rangeMax !== undefined
  const renderReferenceLines = (axis: "x" | "y") =>
    (chartSettings.referenceLines ?? []).map((line) => (
      <ReferenceLine
        ifOverflow={hasCustomRange ? "discard" : "extendDomain"}
        key={line.id}
        label={line.label || undefined}
        stroke={getReferenceLineColor(line)}
        strokeDasharray={getReferenceLineDash(line.style)}
        strokeWidth={1.5}
        {...(axis === "x" ? { x: line.value } : { y: line.value })}
      />
    ))

  if (chartSettings.type === "count") {
    const metricValue = filteredItems.reduce(
      (total, row) =>
        total + getChartMeasureValue(row, measureProperty, propertyValuesByKey),
      0,
    )

    return (
      <div className="flex min-h-[260px] w-full items-center justify-center py-4">
        <div className="text-center">
          <div className="text-6xl font-semibold tabular-nums tracking-normal text-foreground">
            {metricValue.toLocaleString()}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {metricLabel}
          </div>
        </div>
      </div>
    )
  }

  const renderChart = () => {
    if (chartSettings.type === "horizontal-bar") {
      return (
        <BarChart
          accessibilityLayer
          data={displayChartData}
          layout="vertical"
          margin={{ bottom: 12, left: 12, right: 18, top: 12 }}
        >
          <CartesianGrid horizontal={false} />
          <XAxis
            allowDecimals={allowMeasureDecimals}
            axisLine={false}
            domain={numericDomain}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="name"
            tickLine={false}
            tickMargin={8}
            type="category"
            width={96}
          />
          <ChartTooltip
            content={<ChartTooltipContent indicator="line" />}
            cursor={false}
          />
          {renderReferenceLines("x")}
          {shouldSplitSeries ? (
            chartSeries.map((series, index) => (
              <Bar
                dataKey={series.key}
                fill={getSeriesDisplayColor(series, index)}
                key={series.key}
                maxBarSize={34}
                name={series.label}
                radius={
                  index === chartSeries.length - 1 ? [0, 4, 4, 0] : 0
                }
                stackId="group"
              />
            ))
          ) : (
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              maxBarSize={34}
              name={metricLabel}
              radius={[0, 4, 4, 0]}
            >
              {displayChartData.map((item, index) => (
                <Cell fill={getDisplayColor(item, index)} key={item.name} />
              ))}
            </Bar>
          )}
          {shouldSplitSeries ? (
            <ChartLegend content={<ChartLegendContent />} />
          ) : null}
        </BarChart>
      )
    }

    if (chartSettings.type === "line") {
      return (
        <AreaChart
          accessibilityLayer
          data={displayChartData}
          margin={{ bottom: 12, left: 0, right: 12, top: 12 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="name"
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            allowDecimals={allowMeasureDecimals}
            axisLine={false}
            domain={numericDomain}
            tickLine={false}
            tickMargin={10}
            width={34}
          />
          <ChartTooltip
            content={<ChartTooltipContent indicator="line" />}
            cursor={false}
          />
          {renderReferenceLines("y")}
          <defs>
            {(shouldSplitSeries
              ? chartSeries
              : [
                  {
                    color: getDisplayColor(displayChartData[0]!, 0),
                    key: "count",
                    label: metricLabel,
                  },
                ]
            ).map((series, index) => {
              const seriesColor = shouldSplitSeries
                ? getSeriesDisplayColor(series, index)
                : series.color

              return (
                <linearGradient
                  id={`fill-${gradientId}-${series.key}`}
                  key={series.key}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={seriesColor} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={seriesColor} stopOpacity={0.08} />
                </linearGradient>
              )
            })}
          </defs>
          {shouldSplitSeries ? (
            chartSeries.map((series, index) => (
              <Area
                dataKey={series.key}
                fill={`url(#fill-${gradientId}-${series.key})`}
                fillOpacity={0.35}
                key={series.key}
                name={series.label}
                stroke={getSeriesDisplayColor(series, index)}
                strokeWidth={2}
                type="natural"
              />
            ))
          ) : (
            <Area
              dataKey="count"
              fill={`url(#fill-${gradientId}-count)`}
              fillOpacity={0.4}
              name={metricLabel}
              stroke={getDisplayColor(displayChartData[0]!, 0)}
              strokeWidth={2}
              type="natural"
            />
          )}
          {shouldSplitSeries ? (
            <ChartLegend content={<ChartLegendContent />} />
          ) : null}
        </AreaChart>
      )
    }

    if (chartSettings.type === "pie") {
      return (
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={<ChartTooltipContent hideLabel nameKey="name" />}
            cursor={false}
          />
          <Pie
            data={chartData}
            dataKey="count"
            nameKey="name"
            outerRadius={82}
            paddingAngle={2}
          >
            {chartData.map((item, index) => (
              <Cell fill={getDisplayColor(item, index)} key={item.name} />
            ))}
            <LabelList
              className="fill-foreground text-xs"
              dataKey="name"
              stroke="none"
            />
          </Pie>
          {outerPieSegments.length > 0 ? (
            <Pie
              data={outerPieSegments}
              dataKey="value"
              innerRadius={90}
              nameKey="name"
              outerRadius={124}
              paddingAngle={1}
            >
              {outerPieSegments.map((segment, index) => (
                <Cell
                  fill={
                    selectedColor
                      ? getColorVariant(selectedColor, index)
                      : segment.color
                  }
                  key={`${segment.name}-${index}`}
                />
              ))}
            </Pie>
          ) : null}
        </PieChart>
      )
    }

    if (chartSettings.type === "radar") {
      const radarColor = selectedColor ?? DEFAULT_CHART_COLOR

      return (
        <RadarChart accessibilityLayer data={displayChartData}>
          <ChartTooltip
            content={<ChartTooltipContent indicator="line" />}
            cursor={false}
          />
          <PolarAngleAxis dataKey="name" tickLine={false} />
          <PolarGrid />
          {shouldSplitSeries ? (
            chartSeries.map((series, index) => {
              const color = getSeriesDisplayColor(series, index)

              return (
                <Radar
                  dataKey={series.key}
                  fill={color}
                  fillOpacity={0.25}
                  key={series.key}
                  name={series.label}
                  stroke={color}
                  strokeWidth={2}
                />
              )
            })
          ) : (
            <Radar
              dataKey="count"
              fill={radarColor}
              fillOpacity={0.6}
              name={metricLabel}
              stroke={radarColor}
              strokeWidth={2}
            />
          )}
          {shouldSplitSeries ? (
            <ChartLegend content={<ChartLegendContent />} />
          ) : null}
        </RadarChart>
      )
    }

    if (chartSettings.type === "radial") {
      const radialChartData = chartData.map((item, index) => ({
        ...item,
        fill: getDisplayColor(item, index),
      }))

      return (
        <RadialBarChart
          accessibilityLayer
          data={radialChartData}
          endAngle={380}
          innerRadius={30}
          outerRadius={124}
          startAngle={-90}
        >
          <ChartTooltip
            content={<ChartTooltipContent hideLabel nameKey="name" />}
            cursor={false}
          />
          <RadialBar background dataKey="count" name={metricLabel}>
            <LabelList
              className="fill-white text-[11px] capitalize mix-blend-luminosity"
              dataKey="name"
              position="insideStart"
              stroke="none"
            />
          </RadialBar>
        </RadialBarChart>
      )
    }

    return (
      <BarChart
        accessibilityLayer
        data={displayChartData}
        margin={{ bottom: 12, left: 0, right: 12, top: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="name"
          tickLine={false}
          tickMargin={10}
        />
        <YAxis
          allowDecimals={allowMeasureDecimals}
          axisLine={false}
          domain={numericDomain}
          tickLine={false}
          tickMargin={10}
          width={34}
        />
        <ChartTooltip
          content={<ChartTooltipContent indicator="line" />}
          cursor={false}
        />
        {renderReferenceLines("y")}
        {shouldSplitSeries ? (
          chartSeries.map((series, index) => (
            <Bar
              dataKey={series.key}
              fill={getSeriesDisplayColor(series, index)}
              key={series.key}
              maxBarSize={44}
              name={series.label}
              radius={index === chartSeries.length - 1 ? [4, 4, 0, 0] : 0}
              stackId="group"
            />
          ))
        ) : (
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            maxBarSize={44}
            name={metricLabel}
            radius={[4, 4, 0, 0]}
          >
            {displayChartData.map((item, index) => (
              <Cell fill={getDisplayColor(item, index)} key={item.name} />
            ))}
          </Bar>
        )}
        {shouldSplitSeries ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
      </BarChart>
    )
  }

  return (
    <div className="database-chart-view w-full py-4">
      <ChartContainer
        className="h-[360px] w-full aspect-auto"
        config={chartConfig}
        initialDimension={{ height: 360, width: 720 }}
      >
        {renderChart()}
      </ChartContainer>
    </div>
  )
}

function getReferenceLineColor(line: DatabaseChartReferenceLine) {
  return line.color === "black"
    ? "var(--foreground)"
    : getPaletteColor(line.color) ?? "var(--foreground)"
}

function getReferenceLineDash(style: DatabaseChartReferenceLine["style"]) {
  return style === "dashed" ? "6 4" : style === "dotted" ? "2 4" : undefined
}

function useIdWithoutColons() {
  return useId().replace(/:/g, "")
}

function getConfiguredChartOptions(property: {
  property: { config?: unknown }
}) {
  const config = property.property.config

  if (!config || typeof config !== "object" || !("options" in config)) {
    return []
  }

  const options = (config as { options?: unknown }).options

  return Array.isArray(options)
    ? options.filter(
        (option): option is { color?: string; name: string } =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as { name?: unknown }).name === "string",
      )
    : []
}
