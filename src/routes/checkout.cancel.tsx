import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/checkout/cancel')({
  component: CancelPage,
});

function CancelPage() {
  return (
    <main className="sl-co">
      <div className="sl-co-card">
        <div className="sl-co-mark warn">↩</div>
        <h1>Checkout cancelled</h1>
        <p>
          No charge was made. Your held seat is released back to the drop automatically — grab it
          again before it sells out.
        </p>
        <Link to="/" className="sl-button sl-button-primary" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
          Back to drops
        </Link>
      </div>
    </main>
  );
}
