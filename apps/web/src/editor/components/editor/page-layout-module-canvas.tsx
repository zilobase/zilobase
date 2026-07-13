import { Fragment, useState, type ReactElement, type ReactNode } from "react"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { GripVertical, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  canMovePageLayoutModuleToRegion,
  movePageLayoutModule,
  type PageLayoutConfig,
  type PageLayoutModule,
  type PageLayoutModuleDestination,
  type PageLayoutRegion,
} from "@notelab/features/pages"

type PageLayoutModuleCanvasProps = {
  config: PageLayoutConfig
  fullWidth?: boolean
  onChange?: (config: PageLayoutConfig) => void
  renderModule: (module: PageLayoutModule) => ReactNode
}

type LayoutDropSlot = {
  destination: PageLayoutModuleDestination
  id: string
}

const draggableId = (moduleId: string) => `page-layout-module:${moduleId}`
const propertyGroupHomeSlot: LayoutDropSlot = {
  destination: { region: "main" },
  id: "page-layout-slot:main:property-group",
}

function createRegionDropSlots(
  modules: PageLayoutModule[],
  region: PageLayoutRegion,
) {
  return [
    ...modules.map((module) => ({
      destination: { beforeModuleId: module.id, region },
      id: `page-layout-slot:${region}:before:${module.id}`,
    })),
    {
      destination: { region },
      id: `page-layout-slot:${region}:end`,
    },
  ] satisfies LayoutDropSlot[]
}

function formatModuleLabel(module: PageLayoutModule) {
  if (module.type === "property" && module.propertyId) return "Property"
  return module.type
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

function DropSlot({
  disabled = false,
  fill = false,
  slot,
}: {
  disabled?: boolean
  fill?: boolean
  slot: LayoutDropSlot
}) {
  const { isOver, setNodeRef } = useDroppable({
    data: { destination: slot.destination },
    disabled,
    id: slot.id,
  })

  return (
    <div
      aria-hidden
      className={cn(
        "relative shrink-0",
        fill ? "min-h-16 flex-1" : "h-3",
      )}
      ref={setNodeRef}
    >
      <div
        className={cn(
          "absolute inset-x-0 h-0.5 rounded-full bg-primary opacity-0",
          fill ? "top-0" : "top-1/2 -translate-y-1/2",
          isOver && "opacity-100",
        )}
      />
    </div>
  )
}

function ModuleSection({
  children,
  fixed = false,
  handle,
  module,
}: {
  children: ReactNode
  fixed?: boolean
  handle?: ReactNode
  module: PageLayoutModule
}) {
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background transition-colors group-hover/layout-module:border-primary/50">
      <header className="flex h-9 items-center gap-2 rounded-t-lg border-b bg-muted/40 px-2 text-xs font-medium text-muted-foreground">
        {handle}
        <span>{formatModuleLabel(module)}</span>
        {fixed ? (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            Fixed
          </span>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function FixedModule({
  children,
  module,
}: {
  children: ReactNode
  module: PageLayoutModule
}) {
  return (
    <div data-layout-module={module.id}>
      <ModuleSection fixed module={module}>
        {children}
      </ModuleSection>
    </div>
  )
}

function ModuleSeparator() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-center">
      <Button
        aria-label="Add layout module"
        size="icon"
        tabIndex={-1}
        type="button"
        variant="secondary"
      >
        <Plus />
      </Button>
    </div>
  )
}

function DraggableModule({
  children,
  module,
}: {
  children: ReactNode
  module: PageLayoutModule
}) {
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: draggableId(module.id),
  })

  return (
    <div
      className={cn(
        "group/layout-module relative cursor-grab touch-pan-y transition-opacity active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
      data-layout-module={module.id}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <ModuleSection
        handle={
          <span className="flex size-6 items-center justify-center text-muted-foreground">
            <GripVertical className="size-4" />
          </span>
        }
        module={module}
      >
        {children}
      </ModuleSection>
    </div>
  )
}

function LayoutRegion({
  children,
  constrained = false,
  region,
}: {
  children: ReactNode
  constrained?: boolean
  region: PageLayoutRegion
}) {
  return (
    <div
      className={cn(
        "relative h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain",
        region === "panel" && "border-l bg-muted/10",
      )}
    >
      <div
        className={cn(
          "flex min-h-full flex-col p-3",
          constrained && "mx-auto w-full max-w-3xl",
        )}
      >
        {children}
      </div>
    </div>
  )
}

function DroppableModuleSequence({
  activeModule,
  modules,
  region,
  renderModuleFrame,
}: {
  activeModule?: PageLayoutModule
  modules: PageLayoutModule[]
  region: PageLayoutRegion
  renderModuleFrame: (module: PageLayoutModule) => ReactElement
}) {
  const slots = createRegionDropSlots(modules, region)
  const disabled =
    !activeModule ||
    !canMovePageLayoutModuleToRegion(activeModule, region) ||
    (region === "main" && activeModule.type === "property_group")

  return (
    <>
      {modules.map((module, index) => (
        <Fragment key={module.id}>
          <DropSlot disabled={disabled} slot={slots[index]!} />
          {renderModuleFrame(module)}
        </Fragment>
      ))}
      <DropSlot
        disabled={disabled}
        fill={modules.length === 0}
        slot={slots[slots.length - 1]!}
      />
    </>
  )
}

export function PageLayoutModuleCanvas({
  config,
  fullWidth = true,
  onChange,
  renderModule,
}: PageLayoutModuleCanvasProps) {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const activeModule = config.modules.find(
    (module) => module.id === activeModuleId,
  )
  const panelVisible =
    Boolean(onChange) || config.modules.some((module) => module.region === "panel")
  const mainModules = config.modules.filter(
    (module) => module.region === "main",
  )
  const panelModules = config.modules.filter(
    (module) => module.region === "panel",
  )

  if (!onChange) {
    return (
      <div
        className={cn(
          "grid min-w-0",
          panelVisible && "md:grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <div className="min-w-0">
          {mainModules.map((module) => (
            <Fragment key={module.id}>{renderModule(module)}</Fragment>
          ))}
        </div>
        {panelVisible ? (
          <aside className="min-w-0 border-l bg-muted/10">
            {panelModules.map((module) => (
              <Fragment key={module.id}>{renderModule(module)}</Fragment>
            ))}
          </aside>
        ) : null}
      </div>
    )
  }

  const heading = mainModules.find((module) => module.type === "heading")
  const propertyGroup = mainModules.find(
    (module) => module.type === "property_group",
  )
  const movableMainModules = mainModules.filter(
    (module) =>
      module.type !== "heading" && module.type !== "property_group",
  )
  const renderModuleFrame = (module: PageLayoutModule) => (
    <DraggableModule key={module.id} module={module}>
      {renderModule(module)}
    </DraggableModule>
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveModuleId(null)
    if (!over) return

    const moduleId = String(active.id).replace("page-layout-module:", "")
    const destination = over.data.current?.destination as
      | PageLayoutModuleDestination
      | undefined

    if (destination) {
      onChange(movePageLayoutModule(config, moduleId, destination))
    }
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={() => setActiveModuleId(null)}
      onDragEnd={handleDragEnd}
      onDragStart={({ active }) =>
        setActiveModuleId(
          String(active.id).replace("page-layout-module:", ""),
        )
      }
      sensors={sensors}
    >
      <div
        className={cn(
          "grid h-full min-h-0 min-w-0 flex-1",
          panelVisible && "md:grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <LayoutRegion constrained={!fullWidth} region="main">
          {heading ? (
            <FixedModule module={heading}>{renderModule(heading)}</FixedModule>
          ) : null}
          <DropSlot
            disabled={
              activeModule?.type !== "property_group" ||
              activeModule.region !== "panel"
            }
            slot={propertyGroupHomeSlot}
          />
          {propertyGroup ? renderModuleFrame(propertyGroup) : null}
          <ModuleSeparator />
          <DroppableModuleSequence
            activeModule={activeModule}
            modules={movableMainModules}
            region="main"
            renderModuleFrame={renderModuleFrame}
          />
        </LayoutRegion>
        {panelVisible ? (
          <LayoutRegion region="panel">
            <DroppableModuleSequence
              activeModule={activeModule}
              modules={panelModules}
              region="panel"
              renderModuleFrame={renderModuleFrame}
            />
          </LayoutRegion>
        ) : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg">
            <GripVertical className="size-4 text-muted-foreground" />
            {formatModuleLabel(activeModule)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
