import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "../elements/container";

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
}: {
  href: string;
  name: string;
} & Omit<ComponentProps<"a">, "href">) {
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

export function FooterSimple({
  links,
  socialLinks,
  fineprint,
  className,
  ...props
}: {
  links: ReactNode;
  socialLinks?: ReactNode;
  fineprint: ReactNode;
} & ComponentProps<"footer">) {
  return (
    <footer className={clsx("pt-16", className)} {...props}>
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
