"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cx } from "@/components/ui/cx";
import {
  FLAVOR_FAMILIES,
  MAX_FLAVOR_TAGS,
  flavorLabel,
  toggleFlavorTag,
} from "@/lib/flavor-tags";

type FlavorTagPickerProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  /** Start with the families open (e.g. when nothing is picked yet). */
  defaultOpen?: boolean;
};

/**
 * Tap-to-tag flavor notes. Picked tags stay visible as removable chips; the
 * full vocabulary folds away so it doesn't crowd the scoring screen.
 */
export function FlavorTagPicker({ value, onChange, disabled = false, defaultOpen = false }: FlavorTagPickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const atLimit = value.length >= MAX_FLAVOR_TAGS;

  return (
    <div>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Picked flavors">
          {value.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(toggleFlavorTag(value, tag))}
                aria-label={`Remove ${tag}`}
                className="inline-flex h-9 items-center gap-1 rounded-full bg-accent px-3 text-sm font-semibold text-on-accent disabled:opacity-60"
              >
                {flavorLabel(tag)}
                {disabled ? null : <X className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {disabled ? null : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cx(
            "flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover",
            value.length ? "mt-3" : "",
          )}
        >
          {open ? "Hide flavors" : value.length ? "Add more flavors" : "Tap flavors you notice"}
          <ChevronDown className={cx("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      )}

      {open && !disabled ? (
        <div className="mt-3 space-y-3 animate-fade-in">
          {FLAVOR_FAMILIES.map((family) => (
            <div key={family.key}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-faint">{family.label}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {family.tags.map((tag) => {
                  const active = value.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      disabled={!active && atLimit}
                      onClick={() => onChange(toggleFlavorTag(value, tag))}
                      className={cx(
                        "h-9 rounded-full border px-3 text-sm font-semibold disabled:opacity-40",
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-sunken text-fg-muted hover:border-line-strong hover:text-fg",
                      )}
                    >
                      {flavorLabel(tag)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {atLimit ? <p className="text-xs text-fg-faint">That&apos;s the most flavors one pour can hold.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Read-only flavor chips, optionally with counts ("Caramel ×3"). */
export function FlavorTagList({
  tags,
  className,
}: {
  tags: Array<string | { tag: string; count: number }>;
  className?: string;
}) {
  if (!tags.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-1.5", className)}>
      {tags.map((item) => {
        const tag = typeof item === "string" ? item : item.tag;
        const count = typeof item === "string" ? null : item.count;
        return (
          <li
            key={tag}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-raised px-2.5 text-xs font-semibold text-fg-muted"
          >
            {flavorLabel(tag)}
            {count && count > 1 ? <span className="text-fg-faint">×{count}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
