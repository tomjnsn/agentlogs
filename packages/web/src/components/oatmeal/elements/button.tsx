import { clsx } from "clsx";
import type { ComponentProps } from "react";

const sizes = {
  md: "px-3 py-1",
  lg: "px-4 py-2",
};

export function Button({
  size = "md",
  type = "button",
  color = "dark/light",
  className,
  ...props
}: {
  size?: keyof typeof sizes;
  color?: "dark/light" | "light";
} & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full text-sm/7 font-medium",
        color === "dark/light" &&
          "bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-neutral-300 dark:text-neutral-950 dark:hover:bg-neutral-200",
        color === "light" &&
          "hover bg-white text-neutral-950 hover:bg-neutral-900 dark:bg-neutral-900 dark:hover:bg-white",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  size = "md",
  color = "dark/light",
  className,
  href,
  ...props
}: {
  href: string;
  size?: keyof typeof sizes;
  color?: "dark/light" | "light";
} & Omit<ComponentProps<"a">, "href">) {
  return (
    <a
      href={href}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full text-sm/7 font-medium",
        color === "dark/light" &&
          "bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-neutral-300 dark:text-neutral-950 dark:hover:bg-neutral-200",
        color === "light" &&
          "hover bg-white text-neutral-950 hover:bg-neutral-900 dark:bg-neutral-900 dark:hover:bg-white",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function SoftButton({
  size = "md",
  type = "button",
  className,
  ...props
}: {
  size?: keyof typeof sizes;
} & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-neutral-950/10 text-sm/7 font-medium text-neutral-950 hover:bg-neutral-950/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function SoftButtonLink({
  size = "md",
  href,
  className,
  ...props
}: {
  href: string;
  size?: keyof typeof sizes;
} & Omit<ComponentProps<"a">, "href">) {
  return (
    <a
      href={href}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-neutral-950/10 text-sm/7 font-medium text-neutral-950 hover:bg-neutral-950/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function PlainButton({
  size = "md",
  color = "dark/light",
  type = "button",
  className,
  ...props
}: {
  size?: keyof typeof sizes;
  color?: "dark/light" | "light";
} & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm/7 font-medium",
        color === "dark/light" && "text-neutral-950 hover:bg-neutral-950/10 dark:text-white dark:hover:bg-white/10",
        color === "light" && "text-white hover:bg-white/15 dark:hover:bg-white/10",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function PlainButtonLink({
  size = "md",
  color = "dark/light",
  href,
  className,
  ...props
}: {
  href: string;
  size?: keyof typeof sizes;
  color?: "dark/light" | "light";
} & Omit<ComponentProps<"a">, "href">) {
  return (
    <a
      href={href}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm/7 font-medium",
        color === "dark/light" && "text-neutral-950 hover:bg-neutral-950/10 dark:text-white dark:hover:bg-white/10",
        color === "light" && "text-white hover:bg-white/15 dark:hover:bg-white/10",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
