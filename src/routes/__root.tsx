import type { ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Soupleaf Hotpot Pass' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <Document>
      <main style={{ padding: 24 }}>
        <h1>Not found</h1>
        <Link to="/">← Back to drops</Link>
      </main>
    </Document>
  ),
});

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fafaf9',
          color: '#1c1917',
        }}
      >
        <header style={{ padding: '12px 24px', borderBottom: '1px solid #e7e5e4', background: '#fff' }}>
          <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: '#b91c1c' }}>
            🍲 SOUPLEAF · Hotpot Pass
          </Link>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
