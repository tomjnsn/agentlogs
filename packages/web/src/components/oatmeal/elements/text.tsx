import { clsx } from "clsx";
import type { ComponentProps } from "react";

export function Text({ children, className, size = "md", ...props }: ComponentProps<"div"> & { size?: "md" | "lg" }) {
  return (
    <div
      className={clsx(
        size === "md" && "text-base/7",
        size === "lg" && "text-lg/8",
        "text-neutral-400 dark:text-neutral-500",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
