import type { ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Soupleaf Hotpot Pass' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Figtree:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <Document>
      <main className="sl-wrap" style={{ paddingTop: 48 }}>
        <h1 className="sl-title" style={{ fontSize: 36 }}>Not found</h1>
        <Link to="/" className="sl-btn sl-btn-notify" style={{ display: 'inline-block', marginTop: 16 }}>
          ← Back to drops
        </Link>
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

/** Soupleaf leaf mark — green rounded square with a single white leaf cut. */
export function SoupleafMark({ size = 34 }: { size?: number }) {
  const inner = Math.round(size * 0.5);
  return (
    <span className="sl-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.29) }}>
      <i style={{ width: inner, height: inner }} />
    </span>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      </head>
      <body>
        <header className="sl-nav">
          <Link to="/" className="sl-brand">
            <SoupleafMark />
            <span className="sl-brand-name">
              <b>Soupleaf</b>
              <small>HOT POT</small>
            </span>
          </Link>
          <nav className="sl-nav-links">
            <Link to="/">Drops</Link>
            <span className="muted">Find my pass</span>
            <Link to="/staff/verify" className="sl-nav-staff">Staff</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Design system from "Soupleaf Hotpot Pass.dc.html" — fonts, color tokens, and
// the shared storefront components (nav, cards, pills, progress, buttons).
const GLOBAL_CSS = `
:root{
  --sl-ink:#16240f; --sl-ink2:#1c2a1a;
  --sl-green:#3e9b3f; --sl-green-d:#2f7d2a;
  --sl-muted:#566a52; --sl-muted2:#7c8a78; --sl-muted3:#9aa595;
  --sl-line:#e7eee1; --sl-line2:#e9efe4;
  --sl-bg:#eef3ec;
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  font-family:'Figtree',system-ui,-apple-system,sans-serif;
  color:var(--sl-ink2);
  background:var(--sl-bg);
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
@keyframes slpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.78)}}

/* ---- Nav ---- */
.sl-nav{
  position:sticky;top:0;z-index:30;
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 24px;
  background:rgba(255,255,255,.86);
  backdrop-filter:saturate(1.4) blur(10px);
  -webkit-backdrop-filter:saturate(1.4) blur(10px);
  border-bottom:1px solid var(--sl-line2);
}
.sl-brand{display:flex;align-items:center;gap:11px;text-decoration:none}
.sl-mark{
  background:var(--sl-green);display:inline-flex;align-items:center;justify-content:center;
  box-shadow:0 4px 12px rgba(62,155,63,.32);flex:none;
}
.sl-mark i{background:#fff;border-radius:0 20px 0 20px;display:block}
.sl-brand-name{line-height:1.05}
.sl-brand-name b{font-family:'Quicksand',sans-serif;font-weight:700;font-size:19px;letter-spacing:-.01em;color:var(--sl-ink2)}
.sl-brand-name small{display:block;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.22em;color:#8a9785;margin-top:2px}
.sl-nav-links{display:flex;align-items:center;gap:18px;font-size:14px;color:var(--sl-muted);font-weight:500}
.sl-nav-links a{text-decoration:none;color:var(--sl-muted)}
.sl-nav-links a:hover{color:var(--sl-ink)}
.sl-nav-links .muted{color:var(--sl-muted3)}
.sl-nav-staff{background:#fff;border:1px solid #dde7d6;border-radius:9px;padding:8px 14px;color:var(--sl-green-d) !important;font-weight:600}

/* ---- Page shell ---- */
.sl-wrap{max-width:1180px;margin:0 auto;padding:8px 20px 56px}

/* ---- Hero ---- */
.sl-hero{padding:34px 4px 4px;max-width:640px}
.sl-eyebrow{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.2em;color:#7e9277}
.sl-title{font-family:'Quicksand',sans-serif;font-weight:700;font-size:46px;line-height:1.04;letter-spacing:-.02em;color:var(--sl-ink);margin:12px 0 0;text-wrap:balance}
.sl-sub{font-size:17px;color:var(--sl-muted);margin-top:12px;line-height:1.5}

/* ---- Filters ---- */
.sl-filters{display:flex;gap:9px;margin:26px 0 22px;flex-wrap:wrap}
.sl-filter{
  padding:8px 15px;border-radius:999px;background:#fff;border:1px solid #dde7d6;
  color:var(--sl-muted);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;
  transition:background .12s,color .12s,border-color .12s;
}
.sl-filter:hover{border-color:#bcd0b2}
.sl-filter[data-active="true"]{background:var(--sl-ink);color:#fff;border-color:var(--sl-ink)}

/* ---- Grid + cards ---- */
.sl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.sl-card{
  background:#fff;border:1px solid var(--sl-line);border-radius:16px;overflow:hidden;
  box-shadow:0 3px 14px rgba(28,42,26,.05);display:flex;flex-direction:column;
  transition:transform .14s ease,box-shadow .14s ease;
}
.sl-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(28,42,26,.10)}
.sl-card.is-dim{filter:saturate(.6)}
.sl-thumb{
  height:158px;position:relative;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#e9f2e4,#d4e8cb);
}
.sl-thumb-mark{width:48px;height:48px;border-radius:15px;background:var(--sl-green);display:flex;align-items:center;justify-content:center;opacity:.92;box-shadow:0 6px 16px rgba(62,155,63,.3)}
.sl-thumb-mark i{width:24px;height:24px;background:#fff;border-radius:0 21px 0 21px;display:block}
.sl-thumb-badge{
  position:absolute;top:12px;left:12px;font-family:'Space Mono',monospace;font-size:11px;
  background:rgba(22,36,15,.82);color:#fff;border-radius:7px;padding:5px 9px;
}
.sl-card-body{padding:16px 17px 18px;display:flex;flex-direction:column;flex:1}
.sl-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sl-card-name{font-family:'Quicksand',sans-serif;font-weight:700;font-size:18px;color:var(--sl-ink2)}
.sl-card-meta{font-size:13px;color:var(--sl-muted2);margin-top:5px}

/* ---- Pills ---- */
.sl-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.sl-pill-onsale{background:#e7f1e3;color:var(--sl-green-d)}
.sl-pill-soon{background:#f7efdd;color:#a9772a}
.sl-pill-out{background:#f1f0ee;color:#8a8f86}
.sl-dot{width:6px;height:6px;border-radius:50%;background:var(--sl-green);animation:slpulse 1.8s ease-in-out infinite}
.sl-dot-soon{width:7px;height:7px;border:2px solid #c98a2b;border-radius:50%;box-sizing:border-box}

/* ---- Progress ---- */
.sl-progress-row{display:flex;align-items:center;justify-content:space-between;margin:15px 0 7px}
.sl-progress-left{font-size:12px;color:var(--sl-muted);font-weight:600}
.sl-progress-pct{font-family:'Space Mono',monospace;font-size:11px;color:var(--sl-muted3)}
.sl-progress{height:8px;border-radius:999px;background:#e4ebde;overflow:hidden}
.sl-progress > i{display:block;height:100%;background:var(--sl-green);border-radius:999px;transition:width .3s ease}
.sl-progress > i.is-out{background:#c3cabc}

/* ---- "Opens" box (upcoming) ---- */
.sl-opens{margin-top:15px;background:#f6f9f3;border:1px solid var(--sl-line);border-radius:10px;padding:11px 13px}
.sl-opens-label{font-size:12px;color:var(--sl-muted3)}
.sl-opens-when{font-size:13px;color:#3a4a36;font-weight:600;margin-top:2px}

/* ---- Buttons ---- */
.sl-btn{margin-top:16px;font-weight:600;font-size:14px;text-align:center;padding:12px;border-radius:11px;text-decoration:none;display:block;border:1px solid transparent;font-family:inherit;cursor:pointer}
.sl-btn-buy{background:var(--sl-green);color:#fff;box-shadow:0 4px 12px rgba(62,155,63,.26)}
.sl-btn-buy:hover{background:#379037}
.sl-btn-notify{background:#fff;border-color:#cfe0c8;color:var(--sl-green-d)}
.sl-btn-notify:hover{background:#f6f9f3}
.sl-btn-soldout{background:#f1f0ee;color:#aab0a4;cursor:default;pointer-events:none}
.sl-card-cta{margin-top:auto}

/* ---- Footer ---- */
.sl-foot{margin-top:34px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--sl-muted3)}
.sl-foot .mono{font-family:'Space Mono',monospace}

/* ---- Empty state ---- */
.sl-empty{background:#fff;border:1px dashed #cdd9c5;border-radius:16px;padding:40px 28px;text-align:center;color:var(--sl-muted)}
.sl-empty code{background:#eef3ec;border-radius:6px;padding:2px 7px;font-family:'Space Mono',monospace;font-size:13px}

/* ---- Responsive ---- */
@media (max-width:980px){
  .sl-grid{grid-template-columns:repeat(2,1fr)}
  .sl-title{font-size:38px}
}
@media (max-width:640px){
  .sl-nav{padding:12px 16px}
  .sl-nav-links{gap:13px;font-size:13px}
  .sl-brand-name small{display:none}
  .sl-grid{grid-template-columns:1fr}
  .sl-hero{padding-top:22px}
  .sl-title{font-size:30px}
  .sl-sub{font-size:15px}
  .sl-wrap{padding:6px 16px 44px}
  .sl-filters{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .sl-filters::-webkit-scrollbar{display:none}
  .sl-filter{white-space:nowrap}
}
`;
