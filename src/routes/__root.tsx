import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-3 font-display text-6xl md:text-7xl">Lost in thought.</h1>
        <p className="mt-3 text-muted-foreground">That page doesn't exist.</p>
        <a href="/" className="mt-6 inline-block text-primary underline underline-offset-4">Return home</a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Razen — Your AI employee" },
      { name: "description", content: "Razen is the AI employee that researches, writes, plans, and builds — the work of a full team, in one chat. Try free." },
      { property: "og:title", content: "Razen — Your AI employee" },
      { property: "og:description", content: "Research. Write. Plan. Build. The work of a full team, in one chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`.font-display { font-family: 'Newsreader', Georgia, serif !important; }`}</style>
      </head>
      <body><AuthProvider>{children}<Toaster /></AuthProvider><Scripts /></body>
    </html>
  );
}

function RootComponent() { return <Outlet />; }
