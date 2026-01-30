"use client";

import { clsx } from "clsx";
import { useState, type ComponentProps, type ReactNode } from "react";
import { CheckmarkIcon } from "../icons/checkmark-icon";
import { Squares2StackedIcon } from "../icons/squares-2-stacked-icon";

export function InstallCommand({
  snippet,
  variant = "normal",
  className,
  ...props
}: {
  snippet: ReactNode;
  variant?: "normal" | "overlay";
} & ComponentProps<"div">) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = typeof snippet === "string" ? snippet : "";
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-6 rounded-full p-1 font-mono text-sm/7 inset-ring-1 dark:bg-white/10 dark:inset-ring-white/10",
        variant === "normal" && "bg-white text-neutral-500 inset-ring-black/10 dark:text-white",
        variant === "overlay" && "bg-white/15 text-white inset-ring-white/10",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 pl-3">
        <div className="text-current/60 select-none">$</div>
        <span>{snippet}</span>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="group relative flex size-9 items-center justify-center rounded-full after:absolute after:-inset-1 hover:bg-neutral-950/10 dark:hover:bg-white/10 after:pointer-fine:hidden"
      >
        {copied ? <CheckmarkIcon /> : <Squares2StackedIcon />}
      </button>
    </div>
  );
}
