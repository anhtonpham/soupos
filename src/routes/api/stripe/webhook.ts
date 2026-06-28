import { createFileRoute } from '@tanstack/react-router';
import { handleWebhookEvent } from '../../../lib/payments';

// Stripe webhook backstop. Idempotent — safe even if the success redirect already
// fulfilled the order. Verifies the signature against the raw request body.
export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get('stripe-signature');
        if (!signature) return new Response('missing stripe-signature', { status: 400 });
        const raw = await request.text();
        try {
          await handleWebhookEvent(raw, signature);
          return new Response('ok');
        } catch (err) {
          return new Response(`webhook error: ${(err as Error).message}`, { status: 400 });
        }
      },
    },
  },
});
