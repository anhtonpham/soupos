import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/checkout/cancel')({
  component: CancelPage,
});

function CancelPage() {
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <h1>Checkout cancelled</h1>
      <p>No worries — your hold will be released automatically and you weren’t charged.</p>
      <Link
        to="/"
        style={{ display: 'inline-block', marginTop: 16, background: '#b91c1c', color: '#fff', padding: '12px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}
      >
        Back to drops
      </Link>
    </main>
  );
}
