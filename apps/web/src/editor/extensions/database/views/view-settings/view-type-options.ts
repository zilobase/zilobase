import {
  CalendarRange,
  ChartPie,
  FilePenLine,
  GalleryThumbnails,
  Kanban,
  List,
  Table2,
} from "lucide-react";

export const databaseViewTypeOptions = [
  { icon: Table2, label: "Table", type: "table" },
  { icon: Kanban, label: "Board", type: "kanban" },
  { icon: CalendarRange, label: "Timeline", type: "timeline" },
  { icon: List, label: "List", type: "list" },
  { icon: GalleryThumbnails, label: "Gallery", type: "gallery" },
  { icon: ChartPie, label: "Chart", type: "chart" },
  { icon: FilePenLine, label: "Form", type: "form" },
] as const;

export type DatabaseViewType = (typeof databaseViewTypeOptions)[number]["type"];

export function getDatabaseViewTypePresentation(type?: string) {
  const option =
    databaseViewTypeOptions.find((candidate) => candidate.type === type) ??
    databaseViewTypeOptions[0];

  return {
    Icon: option.icon,
    label: option.type === "kanban" ? "Kanban" : option.label,
  };
}
