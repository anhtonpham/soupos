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
            <Link to="/staff" className="sl-nav-staff">Staff</Link>
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

/* ===================================================================
   Shared form controls
   =================================================================== */
.sl-label{font-size:12px;font-weight:600;color:var(--sl-muted);margin-bottom:6px;display:block}
.sl-input{
  width:100%;height:46px;border:1px solid #dde7d6;border-radius:11px;background:#fbfdfa;
  padding:0 14px;color:var(--sl-ink2);font-size:14px;font-family:inherit;
}
.sl-input:focus{outline:none;border-color:var(--sl-green);box-shadow:0 0 0 3px rgba(62,155,63,.15);background:#fff}
.sl-input::placeholder{color:#aab2a3}
textarea.sl-input{height:auto;padding:11px 14px;line-height:1.5;resize:vertical}
.sl-field{display:flex;flex-direction:column}
.sl-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.sl-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:13px}
.sl-err{color:#b4322a;font-size:13px;margin-top:10px}

/* Generic primary/secondary buttons (non-card contexts) */
.sl-button{
  font-family:inherit;font-weight:700;font-size:15px;text-align:center;padding:14px;border-radius:12px;
  border:0;cursor:pointer;width:100%;display:block;text-decoration:none;
}
.sl-button:disabled{opacity:.6;cursor:default}
.sl-button-primary{background:var(--sl-green);color:#fff;box-shadow:0 5px 14px rgba(62,155,63,.28)}
.sl-button-primary:hover:not(:disabled){background:#379037}
.sl-button-dark{background:var(--sl-ink);color:#fff}
.sl-button-ghost{background:#fff;border:1px solid #dde7d6;color:var(--sl-muted)}
.sl-narrow{max-width:560px;margin:0 auto;padding:24px 20px 56px}

/* ===================================================================
   Event page  (/e/$slug)
   =================================================================== */
.sl-ev{max-width:760px;margin:0 auto;padding:18px 20px 64px}
.sl-back{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--sl-muted);text-decoration:none;margin-bottom:16px}
.sl-back:hover{color:var(--sl-ink)}
.sl-ev-hero{background:var(--sl-ink);border-radius:20px;overflow:hidden;color:#fff;padding:26px 28px 28px}
.sl-ev-hero h1{font-family:'Quicksand',sans-serif;font-weight:700;font-size:34px;letter-spacing:-.02em;line-height:1.05;margin:14px 0 0}
.sl-ev-hero p{font-size:15px;color:#bcd4b4;margin:8px 0 0;max-width:460px;line-height:1.5}
.sl-pill-hero{display:inline-flex;align-items:center;gap:7px;background:rgba(91,191,79,.18);border:1px solid rgba(91,191,79,.4);color:#bfe3b3;font-size:12px;font-weight:700;padding:5px 11px;border-radius:999px}
.sl-pill-hero.is-soon{background:rgba(201,138,43,.16);border-color:rgba(201,138,43,.45);color:#e7c98e}
.sl-pill-hero.is-out{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#cdd6c8}
.sl-dot-hero{width:7px;height:7px;border-radius:50%;background:#5bbf4f;animation:slpulse 1.6s ease-in-out infinite}
.sl-ev-stats{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:24px;flex-wrap:wrap}
.sl-ev-left-big{display:flex;align-items:baseline;gap:8px}
.sl-ev-left-big b{font-family:'Quicksand',sans-serif;font-weight:700;font-size:40px;line-height:1;color:#5bbf4f}
.sl-ev-left-big span{font-size:16px;color:#8fae85}
.sl-ev-bar{width:300px;max-width:60vw;height:10px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;margin-top:12px}
.sl-ev-bar > i{display:block;height:100%;background:#5bbf4f;border-radius:999px;transition:width .3s ease}
.sl-ev-bar > i.is-out{background:#8a8f86}
.sl-ev-count{text-align:right}
.sl-ev-count .k{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.14em;color:#8fae85}
.sl-ev-count .v{font-family:'Space Mono',monospace;font-weight:700;font-size:26px;color:#fff;margin-top:4px;letter-spacing:.04em}
.sl-card-panel{background:#fff;border:1px solid var(--sl-line);border-radius:18px;padding:22px 24px;margin-top:18px;box-shadow:0 4px 18px rgba(28,42,26,.06)}
.sl-card-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.sl-card-panel-head h2{font-family:'Quicksand',sans-serif;font-weight:700;font-size:18px;margin:0}
.sl-price{font-family:'Quicksand',sans-serif;font-weight:700;font-size:22px}
.sl-price small{font-size:13px;color:var(--sl-muted2);font-weight:500}
.sl-secure{display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:var(--sl-muted3);margin-top:12px;text-align:center}
.sl-acc{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.sl-acc-item{background:#fff;border:1px solid var(--sl-line);border-radius:13px;padding:15px 18px}
.sl-acc-head{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:0;padding:0;cursor:pointer;font-family:inherit;font-weight:600;font-size:14px;color:#3a4a36}
.sl-acc-body{font-size:13px;color:#6f7d6a;line-height:1.7;margin-top:11px}
.sl-ended-note{font-family:'Quicksand',sans-serif;font-weight:700;font-size:19px;color:#3a4a36;line-height:1.3}
.sl-muted-note{font-size:14px;color:var(--sl-muted2);margin-top:8px;line-height:1.5}

/* ===================================================================
   Phone frame  (pass + scanner share it)
   =================================================================== */
.sl-phone{max-width:392px;margin:24px auto;border-radius:40px;box-shadow:0 14px 40px rgba(28,42,26,.16);overflow:hidden;border:1px solid #cfe0c8}
.sl-phone-status{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 24px}
.sl-phone-status b{font-size:13px;font-weight:700}
.sl-phone-home{height:26px;display:flex;align-items:center;justify-content:center}
.sl-phone-home i{width:128px;height:5px;border-radius:99px;display:block}

/* ---- Digital pass ---- */
.sl-pass{background:var(--sl-green)}
.sl-pass .sl-phone-status{background:var(--sl-green);color:#fff}
.sl-pass .sl-phone-home{background:var(--sl-green)}
.sl-pass .sl-phone-home i{background:rgba(255,255,255,.5)}
.sl-pass-body{background:var(--sl-green);padding:8px 20px 30px;text-align:center}
.sl-pass-brand{display:flex;align-items:center;justify-content:center;gap:9px;padding:10px 0 4px;color:#fff}
.sl-pass-brand .m{width:26px;height:26px;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center}
.sl-pass-brand .m i{width:13px;height:13px;background:var(--sl-green);border-radius:0 11px 0 11px;display:block}
.sl-pass-brand b{font-family:'Quicksand',sans-serif;font-weight:700;font-size:16px}
.sl-valid-badge{display:inline-flex;align-items:center;gap:8px;background:var(--sl-ink);color:#bfe3b3;font-size:13px;font-weight:700;padding:8px 16px;border-radius:999px;margin-top:14px;box-shadow:0 4px 14px rgba(0,0,0,.18)}
.sl-valid-badge i{width:9px;height:9px;border-radius:50%;background:#5bbf4f;box-shadow:0 0 0 4px rgba(91,191,79,.3)}
.sl-pass-card{background:#fff;border-radius:22px;margin-top:18px;padding:24px 22px 22px;box-shadow:0 12px 30px rgba(0,0,0,.16)}
.sl-pass-card h2{font-family:'Quicksand',sans-serif;font-weight:700;font-size:20px;color:var(--sl-ink);margin:0}
.sl-pass-card .ev{font-size:13px;color:var(--sl-muted2);margin-top:3px}
.sl-pass-qr{width:208px;height:208px;margin:18px auto 0;border:1px solid #eef2ea;border-radius:14px;padding:12px;background:#fff}
.sl-pass-qr img{width:100%;height:100%;display:block}
.sl-pass-code{font-family:'Space Mono',monospace;font-size:15px;letter-spacing:.16em;color:var(--sl-ink);font-weight:700;margin-top:16px;word-break:break-all}
.sl-pass-foot{font-size:12px;color:#dbf0d3;margin-top:16px;line-height:1.5}
.sl-pass-divider{height:1px;background:#eef2ea;margin:16px -4px}
.sl-pass-rows{display:flex;justify-content:space-between;text-align:left}
.sl-pass-rows .k{font-size:10px;letter-spacing:.1em;color:var(--sl-muted3);font-family:'Space Mono',monospace}
.sl-pass-rows .v{font-size:13px;color:#3a4a36;font-weight:600;margin-top:3px}

/* ---- Scanner ---- */
.sl-scan{background:#0f1d09}
.sl-scan .sl-phone-status{background:#0f1d09;color:#fff}
.sl-scan-top{background:#0f1d09;padding:14px 18px 0;color:#fff}
.sl-scan-top-head{display:flex;align-items:center;justify-content:space-between}
.sl-scan-top-head b{font-family:'Quicksand',sans-serif;font-weight:700;font-size:16px}
.sl-scan-top-head span{font-family:'Space Mono',monospace;font-size:11px;color:#7f9676}
.sl-viewfinder{position:relative;margin-top:14px;border-radius:18px;overflow:hidden;height:230px;background:#1c2a14}
.sl-viewfinder video{width:100%;height:100%;object-fit:cover;opacity:.85}
.sl-vf-frame{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.sl-vf-frame > div{width:150px;height:150px;position:relative}
.sl-vf-frame b{position:absolute;width:30px;height:30px}
.sl-vf-frame b:nth-child(1){top:0;left:0;border-top:3px solid #5bbf4f;border-left:3px solid #5bbf4f;border-radius:10px 0 0 0}
.sl-vf-frame b:nth-child(2){top:0;right:0;border-top:3px solid #5bbf4f;border-right:3px solid #5bbf4f;border-radius:0 10px 0 0}
.sl-vf-frame b:nth-child(3){bottom:0;left:0;border-bottom:3px solid #5bbf4f;border-left:3px solid #5bbf4f;border-radius:0 0 0 10px}
.sl-vf-frame b:nth-child(4){bottom:0;right:0;border-bottom:3px solid #5bbf4f;border-right:3px solid #5bbf4f;border-radius:0 0 10px 0}
.sl-scan-result{padding:26px 22px;text-align:center;color:#fff}
.sl-scan-result.valid{background:#1f8a3a}
.sl-scan-result.invalid{background:#b4322a}
.sl-scan-mark{width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:32px;font-weight:700;border:2px solid rgba(255,255,255,.55)}
.sl-scan-result h2{font-family:'Quicksand',sans-serif;font-weight:700;font-size:30px;letter-spacing:.02em;margin:14px 0 0}
.sl-scan-info{background:rgba(255,255,255,.14);border-radius:14px;padding:14px;margin-top:16px;text-align:left}
.sl-scan-info .k{font-size:11px;letter-spacing:.1em;color:#cdeccd;font-family:'Space Mono',monospace}
.sl-scan-info .name{font-family:'Quicksand',sans-serif;font-weight:700;font-size:21px;margin-top:2px}
.sl-scan-info .meta{font-size:13px;color:#d7f0d7;margin-top:7px;display:flex;justify-content:space-between;gap:10px}
.sl-scan-note{font-size:12px;color:#d7f0d7;margin-top:13px}
.sl-scan-actions{margin-top:14px;display:flex;gap:10px}
.sl-scan-actions > *{flex:1}
.sl-scan-btn-light{background:#fff;font-weight:700;font-size:15px;padding:14px;border-radius:12px;border:0;cursor:pointer;font-family:inherit}
.sl-scan-result.valid .sl-scan-btn-light{color:#1f8a3a}
.sl-scan-result.invalid .sl-scan-btn-light{color:#b4322a}
.sl-scan-btn-ghost{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);color:#fff;font-weight:700;font-size:14px;padding:14px;border-radius:11px;cursor:pointer;font-family:inherit}
.sl-manual{background:#fff;padding:20px}
.sl-manual .k{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--sl-muted3)}
.sl-manual-row{display:flex;gap:9px;margin-top:11px}
.sl-manual-row input{flex:1;font-family:'Space Mono',monospace;letter-spacing:.08em}
.sl-manual-go{width:52px;background:var(--sl-ink);border:0;border-radius:11px;color:#fff;font-size:18px;cursor:pointer}

/* ---- Staff / admin gate (dark) ---- */
.sl-gate{max-width:480px;margin:32px auto;background:var(--sl-ink);border-radius:18px;padding:40px 34px 38px;text-align:center;color:#fff;box-shadow:0 10px 34px rgba(28,42,26,.18)}
.sl-gate .ic{width:54px;height:54px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto}
.sl-gate h1{font-family:'Quicksand',sans-serif;font-weight:700;font-size:23px;margin:16px 0 0}
.sl-gate p{font-size:13px;color:#9fb595;margin:8px auto 0;line-height:1.5;max-width:330px}
.sl-gate .sl-input{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);color:#fff;text-align:center;letter-spacing:.2em}
.sl-gate .sl-input::placeholder{color:#7f9676;letter-spacing:normal}
.sl-gate-note{font-size:11px;color:#7f9676;margin-top:14px;font-family:'Space Mono',monospace}

/* ===================================================================
   Checkout success / cancel
   =================================================================== */
.sl-co{max-width:600px;margin:0 auto;padding:30px 20px 56px}
.sl-co-card{background:#fff;border:1px solid var(--sl-line2);border-radius:18px;padding:32px 30px;box-shadow:0 10px 34px rgba(28,42,26,.10);text-align:center}
.sl-co-mark{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:28px;font-weight:700}
.sl-co-mark.ok{background:#e7f1e3;border:2px solid #bfe0b4;color:var(--sl-green-d)}
.sl-co-mark.warn{background:#f7efdd;border:2px solid #ecd9b0;color:#c98a2b}
.sl-co-card h1{font-family:'Quicksand',sans-serif;font-weight:700;font-size:26px;margin:16px 0 0;letter-spacing:-.01em}
.sl-co-card p{font-size:14px;color:var(--sl-muted);margin:8px auto 0;line-height:1.5;max-width:400px}
.sl-reveal{background:#fff;border:1px solid var(--sl-line);border-radius:18px;margin-top:22px;overflow:hidden;box-shadow:0 4px 18px rgba(28,42,26,.07);text-align:left}
.sl-reveal-head{background:var(--sl-ink);color:#fff;padding:16px 22px;display:flex;align-items:center;justify-content:between;justify-content:space-between;gap:10px}
.sl-reveal-head b{font-family:'Quicksand',sans-serif;font-weight:700;font-size:16px}
.sl-reveal-head .sub{font-size:12px;color:#8fae85;margin-top:2px}
.sl-reveal-body{padding:22px;display:flex;gap:20px;align-items:center}
.sl-reveal-qr{width:120px;height:120px;border:1px solid #eef2ea;border-radius:12px;padding:8px;flex:none;background:#fff}
.sl-reveal-qr img{width:100%;height:100%;display:block}
.sl-reveal-meta .k{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.14em;color:var(--sl-muted3)}
.sl-reveal-meta .name{font-family:'Quicksand',sans-serif;font-weight:700;font-size:20px;margin-top:3px}
.sl-reveal-meta .code{font-family:'Space Mono',monospace;font-size:12px;color:var(--sl-muted2);margin-top:10px;word-break:break-all}
.sl-co-actions{padding:0 22px 22px}
.sl-co-avail{background:#fff;border:1px solid var(--sl-line);border-radius:13px;padding:14px 16px;margin-top:20px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:13px;color:var(--sl-muted2)}

/* ===================================================================
   Admin console
   =================================================================== */
.sl-admin{min-height:100vh;background:#f6f9f3}
.sl-admin-wrap{display:grid;grid-template-columns:212px 1fr;min-height:100vh}
.sl-rail{background:var(--sl-ink);padding:22px 16px;color:#fff;display:flex;flex-direction:column}
.sl-rail-brand{display:flex;align-items:center;gap:10px;padding:0 6px}
.sl-rail-brand .m{width:30px;height:30px;border-radius:9px;background:#5bbf4f;display:flex;align-items:center;justify-content:center}
.sl-rail-brand .m i{width:15px;height:15px;background:var(--sl-ink);border-radius:0 13px 0 13px;display:block}
.sl-rail-brand b{font-family:'Quicksand',sans-serif;font-weight:700;font-size:16px}
.sl-rail-nav{margin-top:24px;display:flex;flex-direction:column;gap:3px}
.sl-rail-link{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;color:#8fae85;font-size:14px;text-decoration:none;font-weight:500}
.sl-rail-link:hover{color:#bfe3b3}
.sl-rail-link[data-active="true"]{background:rgba(91,191,79,.16);color:#bfe3b3;font-weight:600}
.sl-admin-main{padding:26px 28px}
.sl-admin-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.sl-admin-head h1{font-family:'Quicksand',sans-serif;font-weight:700;font-size:25px;letter-spacing:-.01em;margin:0}
.sl-admin-head .sub{font-size:13px;color:var(--sl-muted2);margin-top:3px}
.sl-admin-actions{display:flex;gap:10px}
.sl-mini-btn{background:#fff;border:1px solid #dde7d6;color:var(--sl-muted);font-weight:600;font-size:13px;padding:10px 15px;border-radius:10px;cursor:pointer;text-decoration:none;font-family:inherit;display:inline-block}
.sl-mini-btn.primary{background:var(--sl-green);border-color:var(--sl-green);color:#fff;box-shadow:0 4px 12px rgba(62,155,63,.26)}
.sl-mini-btn.danger{border-color:#e8bcb4;color:#b4322a}
.sl-mini-btn.warn{border-color:#e7d2c0;color:#a9772a}
.sl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px}
.sl-stat{background:#fff;border:1px solid var(--sl-line);border-radius:14px;padding:16px 17px}
.sl-stat .k{font-size:12px;color:var(--sl-muted2)}
.sl-stat .v{font-family:'Quicksand',sans-serif;font-weight:700;font-size:27px;margin-top:6px}
.sl-stat .n{font-size:11px;color:var(--sl-muted3);margin-top:4px}
.sl-stat .v.green{color:var(--sl-green-d)}
.sl-stat .v.amber{color:#a9772a}
.sl-table{background:#fff;border:1px solid var(--sl-line);border-radius:14px;margin-top:18px;overflow:hidden}
.sl-thead,.sl-trow{display:grid;gap:12px;align-items:center;padding:13px 18px}
.sl-thead{background:#fafcf8;border-bottom:1px solid #eef2ea;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--sl-muted3)}
.sl-trow{border-bottom:1px solid #f1f4ef;font-size:13px}
.sl-trow:last-child{border-bottom:0}
.sl-trow a.row-name{font-weight:700;color:var(--sl-ink2);text-decoration:none}
.sl-trow a.row-name:hover{color:var(--sl-green-d)}
.sl-mono{font-family:'Space Mono',monospace;font-size:12px;color:var(--sl-muted3)}
.sl-spill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;display:inline-block}
.sl-spill.paid,.sl-spill.onsale{background:#e7f1e3;color:var(--sl-green-d)}
.sl-spill.pending,.sl-spill.upcoming{background:#f7efdd;color:#a9772a}
.sl-spill.refunded,.sl-spill.failed{background:#f4eceb;color:#b4322a}
.sl-spill.soldout,.sl-spill.ended,.sl-spill.expired,.sl-spill.cancelled{background:#f1f0ee;color:#8a8f86}
.sl-form-card{background:#fff;border:1px solid var(--sl-line);border-radius:14px;padding:20px;margin-top:14px}
.sl-form-card .k{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--sl-muted3);margin-bottom:13px}
.sl-form-grid{display:grid;gap:14px}
.sl-banner{border-radius:12px;padding:13px 15px;margin-top:16px;display:flex;gap:10px;align-items:flex-start;font-size:12px;line-height:1.5}
.sl-banner.warn{background:#fbf2e3;border:1px solid #f0e0c2;color:#8a6a28}
.sl-banner.danger{background:#fdf6f5;border:1px solid #f0d6d0;color:#7c5a56}
.sl-admin-back{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--sl-muted2);text-decoration:none;margin-bottom:14px}
.sl-admin-back:hover{color:var(--sl-ink)}
.sl-order-actions{display:flex;gap:7px;justify-content:flex-end}
.sl-order-actions button{padding:5px 9px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;background:#fff;border:1px solid var(--sl-line)}
.sl-order-actions button.danger{border-color:#f0d6d0;color:#b4322a}
.sl-order-actions button:disabled{opacity:.5;cursor:default}

@media (max-width:760px){
  .sl-admin-wrap{grid-template-columns:1fr}
  .sl-rail{flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px}
  .sl-rail-nav{flex-direction:row;margin-top:0;gap:6px;overflow-x:auto}
  .sl-stats{grid-template-columns:1fr 1fr}
  .sl-ev-hero h1{font-size:28px}
  .sl-reveal-body{flex-direction:column;text-align:center}
}
`;
