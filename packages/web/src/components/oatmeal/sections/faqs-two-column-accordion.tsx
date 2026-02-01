import { clsx } from "clsx";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { Container } from "../elements/container";
import { Subheading } from "../elements/subheading";
import { Text } from "../elements/text";
import { MinusIcon } from "../icons/minus-icon";
import { PlusIcon } from "../icons/plus-icon";

export function Faq({
  id,
  question,
  answer,
  ...props
}: { question: ReactNode; answer: ReactNode } & ComponentProps<"div">) {
  const autoId = useId();
  const faqId = id || autoId;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div id={faqId} {...props}>
      <button
        type="button"
        id={`${faqId}-question`}
        aria-expanded={isOpen}
        aria-controls={`${faqId}-answer`}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between gap-6 py-4 text-left text-base/7 text-white"
      >
        {question}
        {isOpen ? <MinusIcon className="h-[1lh] shrink-0" /> : <PlusIcon className="h-[1lh] shrink-0" />}
      </button>
      <div
        id={`${faqId}-answer`}
        hidden={!isOpen}
        className="-mt-2 flex flex-col gap-2 pr-12 pb-4 text-sm/7 text-neutral-400"
      >
        {answer}
      </div>
    </div>
  );
}

export function FAQsTwoColumnAccordion({
  headline,
  subheadline,
  className,
  children,
  ...props
}: {
  headline?: ReactNode;
  subheadline?: ReactNode;
} & ComponentProps<"section">) {
  return (
    <section className={clsx("py-16", className)} {...props}>
      <Container className="grid grid-cols-1 gap-x-2 gap-y-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Subheading>{headline}</Subheading>
          {subheadline && <Text className="flex flex-col gap-4 text-pretty">{subheadline}</Text>}
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">{children}</div>
      </Container>
    </section>
  );
}
