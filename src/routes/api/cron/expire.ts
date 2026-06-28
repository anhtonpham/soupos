import { createFileRoute } from '@tanstack/react-router';
import { releaseExpiredHolds } from '../../../lib/inventory';

// Optional Vercel Cron target. Tidies long-expired holds for clean reporting;
// not required for correctness (the claim query already ignores expired holds).
export const Route = createFileRoute('/api/cron/expire')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
          return new Response('unauthorized', { status: 401 });
        }
        const { released } = await releaseExpiredHolds();
        return Response.json({ released });
      },
    },
  },
});
