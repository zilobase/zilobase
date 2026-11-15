import { closeEditorHistory } from "@/sections/pages/editor/runtime/lib/editor-history-coordinator";
import type { Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Copy, GripVertical, Palette, Plus, Trash2, Type } from "@/components/icons";

import {
  DropDrawer,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import { SearchableActionMenuContent } from "@/components/ui/searchable-action-menu";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  slashCommandItems,
  type SlashCommandItem,
} from "../../extensions/components/slash-command";
import { SlashCommandMenu } from "../../extensions/components/slash-command-menu";

import {
  convertBlocks,
  canConvertBlocks,
  convertibleBlockIds,
  canEditEditorStructure,
  insertBlockFromPlus,
  type StructuralInsertionPendingChange,
} from "../../commands/lib/block-insert";
import { useEditorWorkspace } from "../../runtime/components/page-editor-registry";
import { colorWithAlpha, getColorToken, getPaletteColor } from "@/lib/color-tokens";
import type { DragHandleTarget } from "../../toolbar/lib/toolbar";
import type {
  StructuralBlockDeleteAction,
  StructuralBlockDeleteHistory,
  StructuralBlockDeleteRequest,
} from "../../lib/editor-types";
import { toast } from "sonner";
import { ColorPicker } from "../../toolbar/components/color-menu";
import { createResourceHistoryAction } from "../../operations/lib/resource-history";
import { blockMenuSelectionPluginKey } from "../../extensions/lib/block-selection";
import { hasBlockBackground } from "../../extensions/lib/block-background";

type PendingStructuralBlockDelete = StructuralBlockDeleteRequest & {
  action: StructuralBlockDeleteAction;
  pos: number;
};

function findStructuralBlock(editor: Editor, target: PendingStructuralBlockDelete) {
  const idAttribute = target.type === "database" ? "databaseId" : "meetingId";
  const nodeAtOriginalPosition = editor.state.doc.nodeAt(target.pos);

  if (nodeAtOriginalPosition?.attrs[idAttribute] === target.id) {
    return { node: nodeAtOriginalPosition, pos: target.pos };
  }

  let match: { node: typeof nodeAtOriginalPosition; pos: number } | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.attrs[idAttribute] !== target.id) {
      return match === null;
    }

    match = { node, pos };
    return false;
  });

  return match;
}

const blockCommandItems = slashCommandItems.filter((item) => item.title !== "Emoji");

const turnIntoItems = blockCommandItems.filter((item) => convertibleBlockIds.has(item.id));

export function DragBlockMenu({
  editor,
  isOpen,
  target,
  onOpenChange,
  onMenuStateChange,
  onCreateDatabase,
  onCreateMeeting,
  onStructuralInsertionPendingChange,
  getStructuralBlockDeleteAction,
  onDeleteStructuralBlock,
}: {
  editor: Editor;
  isOpen: boolean;
  target: DragHandleTarget | null;
  onOpenChange: (open: boolean) => void;
  onMenuStateChange?: (open: boolean) => void;
  onCreateDatabase?: () => Promise<string | null>;
  onCreateMeeting?: () => Promise<string | null>;
  onStructuralInsertionPendingChange?: StructuralInsertionPendingChange;
  getStructuralBlockDeleteAction?: (
    request: StructuralBlockDeleteRequest,
  ) => StructuralBlockDeleteAction;
  onDeleteStructuralBlock?: (
    request: StructuralBlockDeleteRequest,
  ) => Promise<StructuralBlockDeleteHistory | void>;
}) {
  const workspace = useEditorWorkspace();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingStructuralBlockDelete | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const gripPointerRef = useRef<{
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const suppressGripMenuOpenRef = useRef(false);
  const gripPointerListenersRef = useRef<{
    onPointerCancel: (event: PointerEvent) => void;
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
  } | null>(null);
  const filteredTurnIntoItems = useMemo(
    () =>
      turnIntoItems.filter((item) =>
        item.title.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [search],
  );
  const isPageBlock = target?.node.type.name === "pageBlock";
  const targetColors = useMemo(() => {
    if (!target) {
      return { backgroundColor: null, textColor: null };
    }

    if (target.node.type.name === "pageBlock") {
      return {
        backgroundColor:
          typeof target.node.attrs.backgroundColor === "string"
            ? target.node.attrs.backgroundColor
            : null,
        textColor:
          typeof target.node.attrs.textColor === "string" ? target.node.attrs.textColor : null,
      };
    }

    const backgroundColors = new Set<string | null>();
    const textColors = new Set<string | null>();

    target.node.descendants((node) => {
      if (!node.isText) {
        return;
      }

      const textStyle = node.marks.find((mark) => mark.type.name === "textStyle");
      backgroundColors.add(
        typeof textStyle?.attrs.backgroundColor === "string"
          ? textStyle.attrs.backgroundColor
          : null,
      );
      textColors.add(typeof textStyle?.attrs.color === "string" ? textStyle.attrs.color : null);
    });

    return {
      backgroundColor: hasBlockBackground(target.node.type.name)
        ? getColorToken(target.node.attrs.backgroundColor).value
        : backgroundColors.size < 2
          ? ([...backgroundColors][0] ?? null)
          : undefined,
      textColor: textColors.size < 2 ? ([...textColors][0] ?? null) : undefined,
    };
  }, [target]);

  useEffect(() => {
    onMenuStateChange?.(isOpen || actionsOpen || pendingDelete !== null);
  }, [actionsOpen, isOpen, onMenuStateChange, pendingDelete]);

  const menuTargetPos = target?.pos;
  useEffect(() => {
    if (
      !actionsOpen ||
      menuTargetPos === undefined ||
      editor.isDestroyed ||
      !editor.isInitialized
    ) {
      return;
    }

    editor.view.dispatch(
      editor.state.tr.setMeta(blockMenuSelectionPluginKey, { pos: menuTargetPos }),
    );

    return () => {
      if (!editor.isDestroyed) {
        editor.view.dispatch(editor.state.tr.setMeta(blockMenuSelectionPluginKey, { pos: null }));
      }
    };
  }, [actionsOpen, editor, menuTargetPos]);

  useEffect(() => {
    return () => {
      onMenuStateChange?.(false);
    };
  }, [onMenuStateChange]);

  useEffect(() => {
    return () => {
      const listeners = gripPointerListenersRef.current;

      if (!listeners) {
        return;
      }

      document.removeEventListener("pointermove", listeners.onPointerMove);
      document.removeEventListener("pointerup", listeners.onPointerUp);
      document.removeEventListener("pointercancel", listeners.onPointerCancel);
      gripPointerListenersRef.current = null;
    };
  }, []);

  const handleActionsOpenChange = (open: boolean) => {
    if (open) {
      if (!target || suppressGripMenuOpenRef.current) {
        return;
      }

      onOpenChange(false);
    } else {
      setSearch("");
    }

    setActionsOpen(open);
  };

  const openGripActionsMenu = () => {
    if (!target || suppressGripMenuOpenRef.current) {
      return;
    }

    onOpenChange(false);
    setActionsOpen(true);
  };

  const markGripDragInteraction = () => {
    suppressGripMenuOpenRef.current = true;
    const pointer = gripPointerRef.current;

    if (pointer) {
      pointer.moved = true;
    }

    setActionsOpen(false);
  };

  const unbindGripPointerTracking = () => {
    const listeners = gripPointerListenersRef.current;

    if (!listeners) {
      return;
    }

    document.removeEventListener("pointermove", listeners.onPointerMove);
    document.removeEventListener("pointerup", listeners.onPointerUp);
    document.removeEventListener("pointercancel", listeners.onPointerCancel);
    gripPointerListenersRef.current = null;
  };

  const bindGripPointerTracking = () => {
    unbindGripPointerTracking();

    const handlePointerMove = (event: PointerEvent) => {
      const pointer = gripPointerRef.current;

      if (!pointer) {
        return;
      }

      const deltaX = Math.abs(event.clientX - pointer.x);
      const deltaY = Math.abs(event.clientY - pointer.y);

      if (deltaX > 4 || deltaY > 4) {
        markGripDragInteraction();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const pointer = gripPointerRef.current;

      if (!pointer) {
        unbindGripPointerTracking();
        return;
      }

      window.setTimeout(() => {
        if (!pointer.moved && !suppressGripMenuOpenRef.current) {
          openGripActionsMenu();
        }

        if (!pointer.moved) {
          workspace.drag.endNative();
        }

        gripPointerRef.current = null;
      }, 0);

      unbindGripPointerTracking();
    };

    const handlePointerCancel = () => {
      gripPointerRef.current = null;
      workspace.drag.endNative();
      unbindGripPointerTracking();
    };

    gripPointerListenersRef.current = {
      onPointerCancel: handlePointerCancel,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
  };

  const runTargetCommand = (command: () => void) => {
    if (
      !target ||
      !canEditEditorStructure(editor) ||
      !editor.state.doc.nodeAt(target.pos)?.eq(target.node)
    ) {
      return;
    }

    command();
    handleActionsOpenChange(false);
  };

  const selectTarget = () => {
    if (!target) {
      return false;
    }

    editor.chain().focus().setNodeSelection(target.pos).run();

    return true;
  };

  const turnTargetInto = (item: SlashCommandItem) => {
    runTargetCommand(() => {
      if (!target) {
        return;
      }

      convertBlocks(editor, target, item.id);
    });
  };

  const applyColor = (color: string | null, variant: "text" | "background") => {
    runTargetCommand(() => {
      if (!target) {
        return;
      }

      if (target.node.type.name === "pageBlock") {
        editor
          .chain()
          .focus()
          .setNodeSelection(target.pos)
          .updateAttributes("pageBlock", {
            backgroundColor: variant === "background" ? color : null,
            textColor: variant === "text" ? color : null,
          })
          .run();
        return;
      }

      if (hasBlockBackground(target.node.type.name) && variant === "background") {
        editor
          .chain()
          .focus()
          .setNodeSelection(target.pos)
          .updateAttributes(target.node.type.name, { backgroundColor: color ?? "default" })
          .run();
        return;
      }

      if (target.node.isAtom) {
        return;
      }

      const from = target.pos + 1;
      const to = target.pos + target.node.nodeSize - 1;
      const chain = editor.chain().focus().setTextSelection({ from, to });

      if (!color) {
        chain.unsetColor().unsetBackgroundColor().run();
        return;
      }

      if (variant === "text") {
        chain.unsetBackgroundColor().setColor(getPaletteColor(color)!).run();
        return;
      }

      chain.unsetColor().setBackgroundColor(colorWithAlpha(color, 0.18)!).run();
    });
  };

  const duplicateTarget = () => {
    runTargetCommand(() => {
      if (!target) {
        return;
      }

      editor
        .chain()
        .focus()
        .insertBlocksAt(target.pos + target.node.nodeSize, target.node.toJSON())
        .run();
    });
  };

  const copyTarget = () => {
    runTargetCommand(() => {
      if (!target || !selectTarget()) {
        return;
      }

      try {
        document.execCommand("copy");
      } catch {
        toast.error("Could not copy block.");
      }
    });
  };

  const deleteTarget = () => {
    if (target?.node.type.name === "databaseBlock") {
      const id = target.node.attrs.databaseId;

      if (typeof id === "string" && id) {
        const request = { id, type: "database" as const };
        setPendingDelete({
          ...request,
          action: getStructuralBlockDeleteAction?.(request) ?? "move-to-trash",
          pos: target.pos,
        });
        handleActionsOpenChange(false);
        return;
      }
    }

    if (target?.node.type.name === "meetingBlock") {
      const id = target.node.attrs.meetingId;

      if (typeof id === "string" && id) {
        const request = { id, type: "meeting" as const };
        setPendingDelete({
          ...request,
          action: getStructuralBlockDeleteAction?.(request) ?? "move-to-trash",
          pos: target.pos,
        });
        handleActionsOpenChange(false);
        return;
      }
    }

    runTargetCommand(() => {
      if (!target) {
        return;
      }

      editor
        .chain()
        .focus()
        .removeBlocksRange({
          from: target.pos,
          to: target.pos + target.node.nodeSize,
        })
        .run();
    });
  };

  const confirmStructuralBlockDelete = async () => {
    if (!canEditEditorStructure(editor) || !pendingDelete || deletePending) {
      return;
    }

    setDeletePending(true);

    try {
      if (!onDeleteStructuralBlock) {
        throw new Error("This block cannot be deleted from this editor.");
      }

      const resourceHistory = await onDeleteStructuralBlock({
        id: pendingDelete.id,
        type: pendingDelete.type,
      });

      if (!canEditEditorStructure(editor)) {
        await resourceHistory?.undo();
        return;
      }
      const match = findStructuralBlock(editor, pendingDelete);

      if (match?.node) {
        const deleteEditorBlock = () =>
          editor
            .chain()
            .focus()
            .removeBlocksRange({
              from: match.pos,
              to: match.pos + match.node.nodeSize,
            })
            .run();

        if (resourceHistory) {
          closeEditorHistory(editor);
          workspace.history.suppress(deleteEditorBlock);
          closeEditorHistory(editor);
          workspace.history.push({
            participants: [editor],
            ...createResourceHistoryAction({
              label: "Delete structural block",
              editor: workspace.history.capture(editor),
              onError: (error) => {
                toast.error(
                  error instanceof Error ? error.message : "Could not update the deleted block.",
                );
              },
              resource: resourceHistory,
            }),
          });
        } else {
          deleteEditorBlock();
        }
      }

      setPendingDelete(null);
      toast.success(
        pendingDelete.action === "remove-link" ? "Removed from page." : "Moved to trash.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Could not delete ${pendingDelete.type}.`,
      );
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <>
      <Popover
        onOpenChange={(open) => {
          if (open) handleActionsOpenChange(false);
          onOpenChange(open);
        }}
        open={isOpen && target !== null}
      >
        <PopoverTrigger asChild>
          <Button
            aria-label="Add block below"
            className="pointer-events-auto relative"
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.preventDefault()}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            size="icon"
            title="Add block"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Insert block"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          padding="none"
          variant="menu"
        >
          <SlashCommandMenu
            items={blockCommandItems}
            selectedIndex={0}
            setSelectedIndex={() => undefined}
            selectItem={(index) => {
              const item = blockCommandItems[index];

              if (!item || !target) return;
              void insertBlockFromPlus(editor, target, item, {
                onCreateDatabase,
                onCreateMeeting,
                onStructuralInsertionPendingChange,
              }).catch((error) =>
                toast.error(error instanceof Error ? error.message : "Could not insert block."),
              );
              onOpenChange(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <DropDrawer onOpenChange={handleActionsOpenChange} open={actionsOpen}>
        <div className="relative">
          <DropDrawerTrigger asChild>
            <span aria-hidden className="absolute inset-0 pointer-events-none" tabIndex={-1} />
          </DropDrawerTrigger>
          <Button
            asChild
            className="pointer-events-auto relative cursor-grab active:cursor-grabbing"
            size="icon"
            variant="ghost"
          >
            <span
              aria-expanded={actionsOpen}
              aria-haspopup="menu"
              aria-label="Open block actions"
              draggable
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragEnd={() => {
                workspace.drag.endNative();
                markGripDragInteraction();
                window.setTimeout(() => {
                  suppressGripMenuOpenRef.current = false;
                }, 300);
              }}
              onDragStart={() => markGripDragInteraction()}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }

                event.preventDefault();
                openGripActionsMenu();
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                event.stopPropagation();
                event.nativeEvent.stopImmediatePropagation();
                suppressGripMenuOpenRef.current = false;
                gripPointerRef.current = {
                  moved: false,
                  x: event.clientX,
                  y: event.clientY,
                };
                bindGripPointerTracking();
              }}
              role="button"
              tabIndex={0}
              title="Block actions"
            >
              <GripVertical />
            </span>
          </Button>
        </div>
        <SearchableActionMenuContent
          search={search}
          onSearchChange={setSearch}
          searchLabel="Search block actions"
          onCloseAutoFocus={(event) => event.preventDefault()}
          side="left"
          sideOffset={8}
        >
          <DropDrawerLabel>{isPageBlock ? "Page" : "Block"}</DropDrawerLabel>
          {!isPageBlock ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <Type />
                <span>Turn into</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent className="w-64">
                {filteredTurnIntoItems.length > 0 ? (
                  filteredTurnIntoItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <DropDrawerItem
                        disabled={!target || !canConvertBlocks(editor, target, item.id)}
                        key={item.id}
                        onSelect={() => turnTargetInto(item)}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </DropDrawerItem>
                    );
                  })
                ) : (
                  <DropDrawerItem disabled>No matching block types.</DropDrawerItem>
                )}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          <DropDrawerSub>
            <DropDrawerSubTrigger>
              <Palette />
              <span>Color</span>
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-64 p-2">
              <ColorPicker
                grayBackgroundClassName={
                  target && hasBlockBackground(target.node.type.name)
                    ? "bg-surface-navigation"
                    : undefined
                }
                backgroundColor={targetColors.backgroundColor}
                onBackgroundColorSelect={(color) => applyColor(color, "background")}
                onTextColorSelect={(color) => applyColor(color, "text")}
                textColor={targetColors.textColor}
              />
            </DropDrawerSubContent>
          </DropDrawerSub>
          <DropDrawerSeparator />
          <DropDrawerItem onSelect={copyTarget}>
            <Clipboard />
            <span>Copy</span>
            <DropDrawerShortcut>⌘C</DropDrawerShortcut>
          </DropDrawerItem>
          <DropDrawerItem onSelect={duplicateTarget}>
            <Copy />
            <span>Duplicate</span>
            <DropDrawerShortcut>⌘D</DropDrawerShortcut>
          </DropDrawerItem>
          <DropDrawerSeparator />
          <DropDrawerItem onSelect={deleteTarget} variant="destructive">
            <Trash2 />
            <span>Delete</span>
          </DropDrawerItem>
        </SearchableActionMenuContent>
      </DropDrawer>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deletePending) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.action === "remove-link"
                ? "Remove from this page?"
                : "Move to trash?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.action === "remove-link"
                ? "This linked database view will be removed from this page. The source database will remain available."
                : pendingDelete?.type === "meeting"
                  ? "This meeting and its notes will be moved to trash."
                  : "This database and its row pages will be moved to trash."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault();
                void confirmStructuralBlockDelete();
              }}
              variant="destructive"
            >
              {pendingDelete?.action === "remove-link" ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
