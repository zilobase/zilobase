import { useSortable } from "@dnd-kit/sortable";

import { cn } from "@/shared/lib/utils";

export function RuntimeSectionDragItem({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  const sortable = useSortable({
    animateLayoutChanges: ({ isSorting }) => isSorting,
    id,
  });

  return (
    <div
      className={cn(
        (sortable.isDragging || sortable.isOver) &&
          "relative z-20 bg-sidebar",
      )}
      onPointerDown={(event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !target.closest('[data-sidebar="group-label"]')
        ) {
          return;
        }
        sortable.listeners?.onPointerDown?.(event);
      }}
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform
          ? `translate3d(0, ${sortable.transform.y}px, 0)`
          : undefined,
        transition: sortable.transition,
      }}
    >
      {children}
    </div>
  );
}
