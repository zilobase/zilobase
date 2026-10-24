import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HashIcon, ArrowRightIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  DropDrawer,
  DropDrawerTrigger,
  DropDrawerContent,
  DropDrawerSub,
  DropDrawerSubTrigger,
  DropDrawerSubContent,
  DropDrawerItem,
} from "@/components/ui/dropdrawer";
import "@/styles/global.css";
import "@/styles/app.css";

const params = new URLSearchParams(location.search);
const kind = params.get("kind") ?? "dropdown";
const mode = params.get("mode") === "inline" ? "inline" : "nested";

function Fixture() {
  const [selected, setSelected] = useState("");
  const Sub =
    kind === "context" ? ContextMenuSub : kind === "drawer" ? DropDrawerSub : DropdownMenuSub;
  const SubTrigger =
    kind === "context"
      ? ContextMenuSubTrigger
      : kind === "drawer"
        ? DropDrawerSubTrigger
        : DropdownMenuSubTrigger;
  const SubContent =
    kind === "context"
      ? ContextMenuSubContent
      : kind === "drawer"
        ? DropDrawerSubContent
        : DropdownMenuSubContent;
  const Item =
    kind === "context" ? ContextMenuItem : kind === "drawer" ? DropDrawerItem : DropdownMenuItem;
  const rows = (
    <>
      <Sub>
        <SubTrigger trailing={10}>
          <HashIcon />
          <span>Show</span>
        </SubTrigger>
        <SubContent>
          <Item onSelect={() => setSelected("15")}>15 items</Item>
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger>
          <ArrowRightIcon />
          <span>Move to tab</span>
        </SubTrigger>
        <SubContent>
          <Item>Work</Item>
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger trailing={0}>
          <HashIcon />
          <span>Properties</span>
        </SubTrigger>
        <SubContent>
          <Item>None</Item>
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger trailing="A very long database source name that must stay inside the menu">
          <HashIcon />
          <span>Source</span>
        </SubTrigger>
        <SubContent>
          <Item>Source</Item>
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger>
          <HashIcon />
          <span>Legacy value</span>
          <span data-legacy-value className="ml-auto text-content-secondary">
            20
          </span>
        </SubTrigger>
        <SubContent>
          <Item>Legacy</Item>
        </SubContent>
      </Sub>
    </>
  );
  return (
    <main className="p-8 text-content-primary">
      <output>{selected}</output>
      {kind === "context" ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button>Open menu</button>
          </ContextMenuTrigger>
          <ContextMenuContent width="md">{rows}</ContextMenuContent>
        </ContextMenu>
      ) : kind === "drawer" ? (
        <DropDrawer defaultSubDisplayMode={mode}>
          <DropDrawerTrigger asChild>
            <button>Open menu</button>
          </DropDrawerTrigger>
          <DropDrawerContent width="md">{rows}</DropDrawerContent>
        </DropDrawer>
      ) : (
        <DropdownMenu defaultSubDisplayMode={mode}>
          <DropdownMenuTrigger asChild>
            <button>Open menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent width="md">{rows}</DropdownMenuContent>
        </DropdownMenu>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
