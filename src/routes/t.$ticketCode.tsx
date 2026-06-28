import { createFileRoute } from '@tanstack/react-router';
import { getPassFn } from '../server/verify';

export const Route = createFileRoute('/t/$ticketCode')({
  loader: ({ params }) => getPassFn({ data: { code: params.ticketCode } }),
  component: PassPage,
});

function PassPage() {
  const { result, qrDataUrl } = Route.useLoaderData();

  if (!result.valid) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>❌</div>
        <h1 style={{ color: '#b91c1c' }}>Invalid pass</h1>
        <p style={{ color: '#78716c' }}>This pass could not be verified.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div style={{ background: '#16a34a', color: '#fff', borderRadius: 12, padding: '8px 0', fontWeight: 700, letterSpacing: 1 }}>
        ✓ VALID PASS
      </div>
      <h1 style={{ marginBottom: 0 }}>{result.eventName}</h1>
      <p style={{ color: '#78716c', marginTop: 4 }}>Hotpot Pass holder</p>
      <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 16px' }}>{result.holderName ?? '—'}</div>
      <img src={qrDataUrl} alt="Pass QR code" style={{ width: 280, height: 280 }} />
      <p style={{ color: '#78716c', fontSize: 13, marginTop: 16 }}>Show this to Soupleaf staff in person.</p>
    </main>
  );
}
