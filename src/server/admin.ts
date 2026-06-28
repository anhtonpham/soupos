import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { listEvents, getEventStatus } from '../lib/inventory';

/** Admin-gated dashboard data: every event with live sold/held/available counts. */
export const adminOverviewFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ adminToken: z.string() }).parse(d))
  .handler(async ({ data }) => {
    if (data.adminToken !== (process.env.ADMIN_TOKEN ?? 'change-me-admin')) {
      return { authorized: false as const };
    }
    const events = await listEvents();
    const rows = await Promise.all(
      events.map(async (e) => {
        const s = await getEventStatus(e.slug);
        return {
          slug: e.slug,
          name: e.name,
          priceCents: e.priceCents,
          ticketLimit: s?.ticketLimit ?? e.ticketLimit,
          sold: s?.sold ?? 0,
          held: s?.held ?? 0,
          available: s?.available ?? 0,
          revenueCents: (s?.sold ?? 0) * e.priceCents,
        };
      }),
    );
    return { authorized: true as const, events: rows };
  });
