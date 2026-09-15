import { Check, Palette } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { ButtonGroup } from "@/shared/ui/button-group"
import { Card, CardContent } from "@/shared/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from "@/shared/ui/input-group"
import { Slider } from "@/shared/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import { useEffect, useId, useMemo, useState } from "react"

import {
  buildCoverGalleryDataUrl,
  defaultCoverGalleryConfig,
  ditherCoverPresets,
  gradientCoverPresets,
  parseCoverGalleryDataUrl,
  solidCoverPresets,
  type CoverGalleryConfig,
  type DitherCoverConfig,
  type GradientCoverConfig,
} from "./cover-gallery"

type CoverKind = CoverGalleryConfig["kind"]

type CoverGalleryPickerProps = {
  initialCover?: string
  onChange: (url: string) => void
}

export function CoverGalleryPicker({
  initialCover,
  onChange,
}: CoverGalleryPickerProps) {
  const [config, setConfig] = useState<CoverGalleryConfig>(() =>
    parseCoverGalleryDataUrl(initialCover) ?? defaultCoverGalleryConfig,
  )
  const [customizing, setCustomizing] = useState(false)
  const previewUrl = useMemo(() => buildCoverGalleryDataUrl(config), [config])

  useEffect(() => {
    const parsed = parseCoverGalleryDataUrl(initialCover)
    if (parsed) setConfig(parsed)
  }, [initialCover])

  const updateConfig = (nextConfig: CoverGalleryConfig) => {
    setConfig(nextConfig)
    onChange(buildCoverGalleryDataUrl(nextConfig))
  }

  const chooseKind = (kind: CoverKind) => {
    if (kind === "solid") updateConfig(solidCoverPresets[0])
    if (kind === "gradient") updateConfig(gradientCoverPresets[0])
    if (kind === "dither") updateConfig(ditherCoverPresets[0])
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card className="relative p-0" size="sm">
        <img
          alt="Cover preview"
          className="aspect-[3/1] w-full object-cover"
          src={previewUrl}
        />
        <Button
          aria-pressed={customizing}
          className="absolute right-2 top-2 bg-effect-backdrop shadow-sm backdrop-blur"
          onClick={() => setCustomizing((current) => !current)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Palette />
          {customizing ? "Presets" : "Customize"}
        </Button>
      </Card>

      <Tabs
        className="gap-3"
        onValueChange={(value) => {
          if (value === "solid" || value === "gradient" || value === "dither") {
            chooseKind(value)
          }
        }}
        value={config.kind}
      >
        <TabsList className="w-full">
          <TabsTrigger value="solid">Solid</TabsTrigger>
          <TabsTrigger value="gradient">Gradient</TabsTrigger>
          <TabsTrigger value="dither">Dither</TabsTrigger>
        </TabsList>
        <TabsContent value="solid">
          {customizing ? (
            <CoverCustomizer config={config} onChange={updateConfig} />
          ) : (
            <PresetGrid
              activeConfig={config}
              onSelect={updateConfig}
              presets={solidCoverPresets}
            />
          )}
        </TabsContent>
        <TabsContent value="gradient">
          {customizing ? (
            <CoverCustomizer config={config} onChange={updateConfig} />
          ) : (
            <PresetGrid
              activeConfig={config}
              onSelect={updateConfig}
              presets={gradientCoverPresets}
            />
          )}
        </TabsContent>
        <TabsContent value="dither">
          {customizing ? (
            <CoverCustomizer config={config} onChange={updateConfig} />
          ) : (
            <PresetGrid
              activeConfig={config}
              onSelect={updateConfig}
              presets={ditherCoverPresets}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CoverCustomizer({
  config,
  onChange,
}: {
  config: CoverGalleryConfig
  onChange: (config: CoverGalleryConfig) => void
}) {
  return (
    <Card size="sm">
      <CardContent>
        {config.kind === "solid" ? (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <ColorControl
              label="Color"
              onChange={(color) => onChange({ ...config, color })}
              value={config.color}
            />
          </FieldGroup>
        ) : null}

        {config.kind === "gradient" ? (
          <GradientControls config={config} onChange={onChange} />
        ) : null}

        {config.kind === "dither" ? (
          <DitherControls config={config} onChange={onChange} />
        ) : null}
      </CardContent>
    </Card>
  )
}

function PresetGrid({
  activeConfig,
  onSelect,
  presets,
}: {
  activeConfig: CoverGalleryConfig
  onSelect: (config: CoverGalleryConfig) => void
  presets: CoverGalleryConfig[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {presets.map((preset, index) => {
        const url = buildCoverGalleryDataUrl(preset)
        const selected = JSON.stringify(preset) === JSON.stringify(activeConfig)

        return (
          <Button
            aria-label={`${preset.kind} cover preset ${index + 1}`}
            aria-pressed={selected}
            className="relative h-auto w-full overflow-hidden p-0 aria-pressed:ring-2 aria-pressed:ring-action-focus-ring"
            key={url}
            onClick={() => onSelect(preset)}
            type="button"
            variant="outline"
          >
            <img alt="" className="aspect-[2/1] w-full object-cover" src={url} />
            {selected ? (
              <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-action-selected text-action-on-selected shadow-sm">
                <Check className="size-3" />
              </span>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}

function ColorControl({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  const inputId = useId()

  return (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon className="py-0">
          <input
            aria-label={`${label} picker`}
            className="size-4 cursor-pointer rounded-sm border-0 bg-transparent p-0"
            id={inputId}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            type="color"
            value={value}
          />
        </InputGroupAddon>
        <InputGroupText className="ml-auto pr-2 font-mono text-content-primary">
          {value}
        </InputGroupText>
      </InputGroup>
    </Field>
  )
}

function RangeControl({
  label,
  maximum,
  minimum = 0,
  onChange,
  suffix,
  value,
}: {
  label: string
  maximum: number
  minimum?: number
  onChange: (value: number) => void
  suffix?: string
  value: number
}) {
  const inputId = useId()

  return (
    <Field className="gap-2">
      <span className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        <span className="text-xs/relaxed tabular-nums text-content-secondary">
          {value}{suffix}
        </span>
      </span>
      <Slider
        aria-label={label}
        id={inputId}
        max={maximum}
        min={minimum}
        onValueChange={(next) => onChange(next[0] ?? value)}
        step={1}
        value={[value]}
      />
    </Field>
  )
}

function GradientControls({
  config,
  onChange,
}: {
  config: GradientCoverConfig
  onChange: (config: GradientCoverConfig) => void
}) {
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <ColorControl
          label="Start"
          onChange={(startColor) => onChange({ ...config, startColor })}
          value={config.startColor}
        />
        <ColorControl
          label="End"
          onChange={(endColor) => onChange({ ...config, endColor })}
          value={config.endColor}
        />
      <Field className="gap-1.5">
        <FieldLabel>Type</FieldLabel>
        <ButtonGroup className="w-full">
          {(["linear", "radial"] as const).map((style) => (
            <Button
              aria-pressed={config.style === style}
              className="flex-1 capitalize"
              key={style}
              onClick={() => onChange({ ...config, style })}
              type="button"
              variant={config.style === style ? "secondary" : "outline"}
            >
              {style}
            </Button>
          ))}
        </ButtonGroup>
      </Field>
      {config.style === "linear" ? (
        <RangeControl
          label="Angle"
          maximum={360}
          onChange={(angle) => onChange({ ...config, angle })}
          suffix="°"
          value={config.angle}
        />
      ) : null}
    </FieldGroup>
  )
}

function DitherControls({
  config,
  onChange,
}: {
  config: DitherCoverConfig
  onChange: (config: DitherCoverConfig) => void
}) {
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <ColorControl
          label="Background"
          onChange={(backgroundColor) => onChange({ ...config, backgroundColor })}
          value={config.backgroundColor}
        />
        <ColorControl
          label="Dots"
          onChange={(foregroundColor) => onChange({ ...config, foregroundColor })}
          value={config.foregroundColor}
        />
      <RangeControl
        label="Wave frequency"
        maximum={10}
        minimum={1}
        onChange={(frequency) => onChange({ ...config, frequency })}
        value={config.frequency}
      />
      <RangeControl
        label="Wave amplitude"
        maximum={80}
        onChange={(amplitude) => onChange({ ...config, amplitude })}
        value={config.amplitude}
      />
      <RangeControl
        label="Dot size"
        maximum={5}
        minimum={1}
        onChange={(dotSize) => onChange({ ...config, dotSize })}
        value={config.dotSize}
      />
      <RangeControl
        label="Direction"
        maximum={180}
        onChange={(angle) => onChange({ ...config, angle })}
        suffix="°"
        value={config.angle}
      />
    </FieldGroup>
  )
}
