import { createFileRoute, Link } from '@tanstack/react-router';
import { confirmCheckout } from '../server/checkout';
import { getPassFn } from '../server/verify';

export const Route = createFileRoute('/checkout/success')({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === 'string' ? search.session_id : '',
  }),
  loaderDeps: ({ search }) => ({ sessionId: search.session_id }),
  loader: async ({ deps }) => {
    if (!deps.sessionId) return { ok: false as const, reason: 'NO_SESSION' as const };
    const confirmed = await confirmCheckout({ data: { sessionId: deps.sessionId } });
    if (!confirmed.ok) return confirmed;
    // Pull the issued pass so we can reveal it inline (QR + holder name).
    const pass = confirmed.ticketCode
      ? await getPassFn({ data: { code: confirmed.ticketCode } })
      : null;
    return { ok: true as const, ticketCode: confirmed.ticketCode, pass };
  },
  component: SuccessPage,
});

function SuccessPage() {
  const result = Route.useLoaderData();

  if (!result.ok) {
    const message =
      result.reason === 'NO_CAPACITY_REFUNDED'
        ? 'That drop sold out before your payment completed, so you were not charged (any hold is refunded).'
        : result.reason === 'NOT_PAID'
          ? 'We couldn’t confirm your payment yet. If you were charged, reopen this page from your receipt.'
          : 'We couldn’t find your checkout session.';
    return (
      <main className="sl-co">
        <div className="sl-co-card">
          <div className="sl-co-mark warn">↩</div>
          <h1>Hmm — something’s off</h1>
          <p>{message}</p>
          <Link to="/" className="sl-button sl-button-primary" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            Back to drops
          </Link>
        </div>
      </main>
    );
  }

  const holder = result.pass?.result.valid ? result.pass.result.holderName : null;
  const eventName = result.pass?.result.valid ? result.pass.result.eventName : 'Hotpot Pass';

  return (
    <main className="sl-co">
      <div className="sl-co-card">
        <div className="sl-co-mark ok">✓</div>
        <h1>You’re in! Pass confirmed.</h1>
        <p>Payment received. Save this page — your pass below is what you show at the counter.</p>

        {result.pass?.result.valid && result.ticketCode && (
          <div className="sl-reveal">
            <div className="sl-reveal-head">
              <div>
                <b>{eventName}</b>
                <div className="sub">Soupleaf Hot Pot · Austin, TX</div>
              </div>
              <span className="sl-pill-hero" style={{ flex: 'none' }}><i className="sl-dot-hero" />VALID</span>
            </div>
            <div className="sl-reveal-body">
              <div className="sl-reveal-qr"><img src={result.pass.qrDataUrl} alt="Pass QR code" /></div>
              <div className="sl-reveal-meta">
                <div className="k">HOLDER</div>
                <div className="name">{holder ?? '—'}</div>
                <div className="code">PASS · {result.ticketCode}</div>
              </div>
            </div>
            <div className="sl-co-actions">
              <Link to="/t/$ticketCode" params={{ ticketCode: result.ticketCode }} className="sl-button sl-button-primary">
                Open my pass →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
