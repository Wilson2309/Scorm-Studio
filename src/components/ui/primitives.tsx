import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveContent } from "./interactive-content";

export function Button({ variant = "primary", className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button className={cn("button", `button-${variant}`, className)} {...props}><InteractiveContent enabled={variant === "primary" && !props.disabled}>{children}</InteractiveContent></button>;
}
export function ButtonLink({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return <Link href={href} className={cn("button", `button-${variant}`, className)}><InteractiveContent enabled={variant === "primary"}>{children}</InteractiveContent></Link>;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("card", className)}>{children}</div>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "blue" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading" aria-label={eyebrow}><div><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;
}
export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><Inbox size={32} aria-hidden="true" /><h2>{title}</h2><p>{description}</p></div>; }
export function TextLink({ href, children }: { href: string; children: ReactNode }) { return <Link className="text-link" href={href}>{children}<ArrowUpRight size={16} aria-hidden="true" /></Link>; }
