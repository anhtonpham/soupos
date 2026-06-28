import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import QRCode from 'qrcode';
import { verifyTicket } from '../lib/inventory';
import { APP_BASE_URL } from '../lib/stripe';

/** Public: load a pass for display (includes a rendered QR data URL). */
export const getPassFn = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ code: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const result = await verifyTicket(data.code);
    const qrDataUrl = await QRCode.toDataURL(`${APP_BASE_URL}/t/${data.code}`, { margin: 1, width: 280 });
    return { result, qrDataUrl };
  });

/** Staff-gated: verify a scanned/entered code. Read-only authenticity check. */
export const verifyTicketFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ code: z.string().min(1), staffToken: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.staffToken !== (process.env.STAFF_TOKEN ?? 'change-me-staff')) {
      return { authorized: false as const };
    }
    return { authorized: true as const, result: await verifyTicket(data.code) };
  });
