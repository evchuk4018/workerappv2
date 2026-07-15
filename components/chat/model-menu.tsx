"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Gauge } from "lucide-react";
import { MODEL_PRESETS, type ModelPreset } from "@/lib/models";

export function ModelMenu({ value, onChange, disabled }: {
  value: ModelPreset;
  onChange: (preset: ModelPreset) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="model-menu" ref={rootRef}>
      {open && (
        <div className="model-popover" role="menu" aria-label="DeepSeek model preset">
          <div className="model-popover-heading">
            <Gauge size={16} /> Thinking level
          </div>
          {(Object.entries(MODEL_PRESETS) as [ModelPreset, (typeof MODEL_PRESETS)[ModelPreset]][]).map(
            ([key, option]) => (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={key === value}
                className="model-option"
                onClick={() => { onChange(key); setOpen(false); }}
              >
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                {key === value && <Check size={17} />}
              </button>
            ),
          )}
        </div>
      )}
      <button
        className="model-trigger"
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {MODEL_PRESETS[value].label}<ChevronDown size={15} />
      </button>
    </div>
  );
}
