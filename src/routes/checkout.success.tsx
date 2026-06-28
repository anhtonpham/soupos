import { createFileRoute, Link } from '@tanstack/react-router';
import { confirmCheckout } from '../server/checkout';

export const Route = createFileRoute('/checkout/success')({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === 'string' ? search.session_id : '',
  }),
  loaderDeps: ({ search }) => ({ sessionId: search.session_id }),
  loader: async ({ deps }) => {
    if (!deps.sessionId) return { ok: false as const, reason: 'NO_SESSION' };
    return confirmCheckout({ data: { sessionId: deps.sessionId } });
  },
  component: SuccessPage,
});

function SuccessPage() {
  const result = Route.useLoaderData();

  if (result.ok) {
    return (
      <main style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <h1>You’re in!</h1>
        <p>Your Hotpot Pass is ready. We’ve also emailed you the link.</p>
        {result.ticketCode && (
          <Link to="/t/$ticketCode" params={{ ticketCode: result.ticketCode }} style={button}>
            View my pass →
          </Link>
        )}
      </main>
    );
  }

  const message =
    result.reason === 'NO_CAPACITY_REFUNDED'
      ? 'That drop sold out before your payment completed, so you were not charged (any hold is refunded).'
      : result.reason === 'NOT_PAID'
        ? 'We couldn’t confirm your payment yet. If you were charged, your pass link will arrive by email.'
        : 'We couldn’t find your checkout session.';

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <h1>Hmm…</h1>
      <p>{message}</p>
      <Link to="/" style={button}>Back to drops</Link>
    </main>
  );
}

const button: React.CSSProperties = {
  display: 'inline-block', marginTop: 16, background: '#b91c1c', color: '#fff',
  padding: '12px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700,
};
