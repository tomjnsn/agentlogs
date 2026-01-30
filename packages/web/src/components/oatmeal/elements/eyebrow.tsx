import { clsx } from "clsx";
import type { ComponentProps } from "react";

export function Eyebrow({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={clsx("text-sm/7 font-semibold text-neutral-400 dark:text-neutral-500", className)} {...props}>
      {children}
    </div>
  );
}
