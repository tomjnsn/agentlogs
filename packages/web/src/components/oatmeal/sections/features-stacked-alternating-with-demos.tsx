import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { Section } from "../elements/section";

export function Feature({
  headline,
  subheadline,
  cta,
  demo,
  className,
}: {
  headline: ReactNode;
  subheadline: ReactNode;
  cta?: ReactNode;
  demo: ReactNode;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      className={clsx(
        "group grid grid-flow-dense grid-cols-1 gap-2 rounded-lg bg-white/5 p-2 lg:grid-cols-2",
        className,
      )}
    >
      <div className="flex flex-col justify-between gap-6 p-6 sm:gap-10 sm:p-10 lg:p-6 lg:group-even:col-start-2">
        <div className="text-xl/8 sm:text-2xl/9">
          <h3 className="text-white">{headline}</h3>
          <div className="flex flex-col gap-4 text-neutral-400">{subheadline}</div>
        </div>
        {cta}
      </div>
      <div className="relative overflow-hidden rounded-sm after:absolute after:inset-0 after:rounded-sm after:ring-1 after:ring-white/10 after:ring-inset lg:group-even:col-start-1">
        {demo}
      </div>
    </div>
  );
}

export function FeaturesStackedAlternatingWithDemos({
  features,
  ...props
}: { features: ReactNode } & Omit<ComponentProps<typeof Section>, "children">) {
  return (
    <Section {...props}>
      <div className="grid grid-cols-1 gap-6">{features}</div>
    </Section>
  );
}
