import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 scanlines">
      <div className="text-center">
        <p className="font-mono text-xs text-primary">[ERR_404]</p>
        <h1 className="mt-2 font-display text-7xl">page.not_found</h1>
        <a href="/" className="mt-6 inline-block font-mono text-sm text-primary underline underline-offset-4">→ return /home</a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Razen AI — The Master Brain" },
      { name: "description", content: "One unified AI agent. Web research, code execution, long-horizon reasoning. Built for operators." },
      { property: "og:title", content: "Razen AI — The Master Brain" },
      { property: "og:description", content: "One unified AI agent. Web research, code execution, long-horizon reasoning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body><AuthProvider>{children}<Toaster theme="dark" /></AuthProvider><Scripts /></body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
