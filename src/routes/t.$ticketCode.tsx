import { createFileRoute, Link } from '@tanstack/react-router';
import { getPassFn } from '../server/verify';

export const Route = createFileRoute('/t/$ticketCode')({
  loader: ({ params }) => getPassFn({ data: { code: params.ticketCode } }),
  component: PassPage,
});

function PassPage() {
  const { result, qrDataUrl } = Route.useLoaderData();
  const { ticketCode } = Route.useParams();

  if (!result.valid) {
    return (
      <main className="sl-co">
        <div className="sl-co-card">
          <div className="sl-co-mark warn" style={{ background: '#f4eceb', borderColor: '#e8bcb4', color: '#b4322a' }}>✕</div>
          <h1>Invalid pass</h1>
          <p>This pass could not be verified. It may have been refunded, or the link is mistyped.</p>
          <Link to="/" className="sl-button sl-button-primary" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            Back to drops
          </Link>
        </div>
      </main>
    );
  }

  const issued = result.soldAt ? new Date(result.soldAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div className="sl-phone sl-pass">
      <div className="sl-phone-status"><b>9:41</b><span style={{ fontSize: 11, color: '#dbf0d3' }}>●●● ▾ ▮</span></div>
      <div className="sl-pass-body">
        <div className="sl-pass-brand">
          <span className="m"><i /></span>
          <b>Soupleaf</b>
        </div>
        <div className="sl-valid-badge"><i />VALID PASS</div>

        <div className="sl-pass-card">
          <h2>{result.holderName ?? 'Pass holder'}</h2>
          <div className="ev">{result.eventName}</div>
          <div className="sl-pass-qr"><img src={qrDataUrl} alt="Pass QR code" /></div>
          <div className="sl-pass-code">{ticketCode}</div>
          <div className="sl-pass-divider" />
          <div className="sl-pass-rows">
            <div>
              <div className="k">ISSUED</div>
              <div className="v">{issued}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="k">EVENT</div>
              <div className="v">{result.eventName}</div>
            </div>
          </div>
        </div>

        <div className="sl-pass-foot">
          Show this screen at the counter.<br />Staff will match your name to a photo ID.
        </div>
      </div>
      <div className="sl-phone-home"><i /></div>
    </div>
  );
}
