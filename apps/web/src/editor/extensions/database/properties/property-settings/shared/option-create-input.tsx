import { useState } from "react";

import { Input } from "@/components/ui/input";

export function OptionCreateInput({
  ariaLabel,
  onCancel,
  onCreate,
  placeholder,
}: {
  ariaLabel: string;
  onCancel: () => void;
  onCreate: (name: string) => void;
  placeholder: string;
}) {
  const [name, setName] = useState("");

  return (
    <div className="px-1.5 py-1">
      <Input
        aria-label={ariaLabel}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();

          if (event.key === "Enter") {
            event.preventDefault();

            const nextName = name.trim();

            if (nextName) {
              onCreate(nextName);
            }
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        value={name}
      />
    </div>
  );
}
