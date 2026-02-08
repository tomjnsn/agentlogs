import { clsx } from "clsx";
import { type ComponentProps, type ReactNode, useId, useState } from "react";

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Main({ children, className, ...props }: ComponentProps<"main">) {
  return (
    <main className={clsx("isolate overflow-clip", className)} {...props}>
      {children}
    </main>
  );
}

export function Container({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={clsx("mx-auto w-full max-w-2xl px-6 md:max-w-3xl lg:max-w-7xl lg:px-10", className)} {...props}>
      {children}
    </div>
  );
}

// ─── Typography ──────────────────────────────────────────────────────────────

export function Heading({ children, className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={clsx("text-5xl/12 font-semibold tracking-tight text-balance text-white sm:text-[5rem]/20", className)}
      {...props}
    >
      {children}
    </h1>
  );
}

export function Subheading({ children, className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={clsx("text-[2rem]/10 font-semibold tracking-tight text-pretty text-white sm:text-5xl/14", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function BodyText({
  children,
  className,
  size = "md",
  ...props
}: ComponentProps<"div"> & { size?: "md" | "lg" }) {
  return (
    <div
      className={clsx(size === "md" && "text-base/7", size === "lg" && "text-lg/8", "text-neutral-400", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

const buttonSizes = {
  md: "px-3 py-1",
  lg: "px-4 py-2",
};

export function ButtonLink({
  size = "md",
  href,
  className,
  ...props
}: { href: string; size?: "md" | "lg" } & Omit<ComponentProps<"a">, "href">) {
  return (
    <a
      href={href}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-neutral-300 text-sm/7 font-medium text-neutral-950 hover:bg-neutral-200",
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function PlainButtonLink({
  size = "md",
  href,
  className,
  ...props
}: { href: string; size?: "md" | "lg" } & Omit<ComponentProps<"a">, "href">) {
  return (
    <a
      href={href}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm/7 font-medium text-white hover:bg-white/10",
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

// ─── Screenshot / Wallpaper ──────────────────────────────────────────────────

const wallpaperColors = {
  green: "from-[#333a2b] to-[#26361b]",
  blue: "from-[#243a42] to-[#232f40]",
  purple: "from-[#412c42] to-[#3c1a26]",
  art: "",
};

export function Screenshot({
  children,
  wallpaper,
  className,
  ...props
}: {
  wallpaper: "green" | "blue" | "purple" | "art";
} & ComponentProps<"div">) {
  return (
    <div
      className={clsx("relative overflow-hidden rounded-2xl bg-linear-to-b", wallpaperColors[wallpaper], className)}
      {...props}
    >
      {wallpaper === "art" ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
          style={{ backgroundImage: "url(/The_Fighting_Temeraire.jpg)" }}
        />
      ) : (
        <div className="absolute inset-0 opacity-25 mix-blend-overlay" />
      )}
      <div className="relative p-[min(10%,4rem)] pb-0">
        <div className="*:rounded-t-sm *:ring-1 *:ring-black/10">{children}</div>
      </div>
    </div>
  );
}

export function FeatureScreenshot({
  children,
  wallpaper,
  className,
  ...props
}: {
  wallpaper: "green" | "blue" | "purple";
} & ComponentProps<"div">) {
  return (
    <div className={clsx("relative overflow-hidden bg-linear-to-b", wallpaperColors[wallpaper], className)} {...props}>
      <div className="absolute inset-0 opacity-25 mix-blend-overlay" />
      <div className="relative pt-[min(10%,4rem)] pl-[min(10%,4rem)]">
        <div className="*:rounded-tl-sm *:ring-1 *:ring-black/10">{children}</div>
      </div>
    </div>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

export function HeroSection({
  headline,
  subheadline,
  cta,
  demo,
}: {
  headline: ReactNode;
  subheadline: ReactNode;
  cta?: ReactNode;
  demo?: ReactNode;
}) {
  return (
    <section className="py-16">
      <Container className="flex flex-col gap-16">
        <div className="flex flex-col gap-32">
          <div className="flex flex-col items-start gap-6">
            <Heading className="max-w-5xl">{headline}</Heading>
            <BodyText size="lg" className="flex max-w-3xl flex-col gap-4">
              {subheadline}
            </BodyText>
            {cta}
          </div>
          {demo}
        </div>
      </Container>
    </section>
  );
}

export function FeaturesSection({
  headline,
  subheadline,
  children,
}: {
  headline: ReactNode;
  subheadline: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10 sm:gap-16">
        <div className="flex max-w-2xl flex-col gap-6">
          <Subheading>{headline}</Subheading>
          <BodyText className="text-pretty">{subheadline}</BodyText>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">{children}</div>
      </Container>
    </section>
  );
}

export function FeatureCard({
  demo,
  headline,
  subheadline,
}: {
  demo: ReactNode;
  headline: ReactNode;
  subheadline: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <div className="relative overflow-hidden rounded-sm after:absolute after:inset-0 after:rounded-sm after:outline-1 after:-outline-offset-1 after:outline-white/10">
        {demo}
      </div>
      <div className="p-6 sm:p-10 lg:p-6">
        <h3 className="text-base/8 font-medium text-white">{headline}</h3>
        <div className="mt-2 text-sm/7 text-neutral-400">{subheadline}</div>
      </div>
    </div>
  );
}

export function FAQSection({ headline, children }: { headline: ReactNode; children: ReactNode }) {
  return (
    <section className="py-16">
      <Container className="grid grid-cols-1 gap-x-2 gap-y-8 lg:grid-cols-2">
        <div>
          <Subheading>{headline}</Subheading>
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">{children}</div>
      </Container>
    </section>
  );
}

export function Faq({ question, answer }: { question: ReactNode; answer: ReactNode }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        id={`${id}-q`}
        aria-expanded={isOpen}
        aria-controls={`${id}-a`}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between gap-6 py-4 text-left text-base/7 text-white"
      >
        {question}
        <svg
          width={13}
          height={13}
          viewBox={isOpen ? "0 0 13 1" : "0 0 13 13"}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          className="h-[1lh] shrink-0"
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.505.5h-12" />
          ) : (
            <>
              <path d="M6.5 0.5V12.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12.505 6.495H0.505" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
        </svg>
      </button>
      <div id={`${id}-a`} hidden={!isOpen} className="-mt-2 flex flex-col gap-2 pr-12 pb-4 text-sm/7 text-neutral-400">
        {answer}
      </div>
    </div>
  );
}

export function CTASection({
  headline,
  subheadline,
  cta,
}: {
  headline: ReactNode;
  subheadline?: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col gap-6">
          <Subheading className="max-w-4xl">{headline}</Subheading>
          {subheadline && <BodyText className="flex max-w-3xl flex-col gap-4 text-pretty">{subheadline}</BodyText>}
        </div>
        {cta}
      </Container>
    </section>
  );
}

export function Footer({
  links,
  socialLinks,
  fineprint,
}: {
  links: ReactNode;
  socialLinks?: ReactNode;
  fineprint: ReactNode;
}) {
  return (
    <footer className="pt-16">
      <div className="border-t border-white/10 py-12 text-white">
        <Container className="flex flex-col gap-8 text-center text-sm/7">
          <div className="flex flex-col gap-6">
            <nav>
              <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">{links}</ul>
            </nav>
            {socialLinks && <div className="flex items-center justify-center gap-10">{socialLinks}</div>}
          </div>
          <div className="text-neutral-600">{fineprint}</div>
        </Container>
      </div>
    </footer>
  );
}

export function FooterLink({ href, className, ...props }: { href: string } & Omit<ComponentProps<"a">, "href">) {
  return (
    <li className={clsx("text-neutral-500 transition-colors hover:text-white", className)}>
      <a href={href} {...props} />
    </li>
  );
}

export function SocialLink({
  href,
  name,
  className,
  ...props
}: { href: string; name: string } & Omit<ComponentProps<"a">, "href">) {
  return (
    <a
      href={href}
      target="_blank"
      aria-label={name}
      className={clsx("text-neutral-500 transition-colors *:size-6 hover:text-white", className)}
      {...props}
    />
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

export function ArrowNarrowRightIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      width={13}
      height={7}
      viewBox="0 0 13 7"
      fill="none"
      strokeWidth={1}
      className={clsx("inline-block", className)}
      {...props}
    >
      <path d="M12.5049 3.49512L0.504883 3.49512" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 6.5L12.5 3.5L9.5 0.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
