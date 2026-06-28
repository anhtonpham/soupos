import { randomBytes } from 'node:crypto';

/**
 * Generates an unguessable ticket code (the QR bearer credential).
 * ~128 bits of entropy, URL-safe.
 */
export function generateTicketCode(): string {
  return randomBytes(16).toString('base64url');
}
