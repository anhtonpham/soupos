import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getEventStatus, listEvents } from '../lib/inventory';

export const listEventsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const events = await listEvents();
  const withStatus = await Promise.all(
    events.map(async (e) => {
      const status = await getEventStatus(e.slug);
      return {
        slug: e.slug,
        name: e.name,
        description: e.description,
        priceCents: e.priceCents,
        currency: e.currency,
        saleStartsAt: e.saleStartsAt,
        saleEndsAt: e.saleEndsAt,
        maxPerUser: e.maxPerUser,
        ticketLimit: status?.ticketLimit ?? e.ticketLimit,
        sold: status?.sold ?? 0,
        available: status?.available ?? 0,
      };
    }),
  );
  return withStatus;
});

export const getEventStatusFn = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => getEventStatus(data.slug));
