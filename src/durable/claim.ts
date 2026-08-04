import { DomainError } from '../room-store/errors.js';
import { normaliseEmail } from '../otp/codes.js';
import { mergePlayers } from './merge.js';
import type { PrismaClient } from '@prisma/client';

export class EmailInvalidError extends DomainError {
  readonly code = 'EMAIL_INVALID' as const;

  constructor() {
    super('that does not look like an email address');
    this.name = 'EmailInvalidError';
  }
}

export class IdentityNotFoundError extends DomainError {
  readonly code = 'IDENTITY_NOT_FOUND' as const;

  constructor() {
    super('there is no record for this device to claim');
    this.name = 'IdentityNotFoundError';
  }
}

export interface ClaimRequest {
  /** The identity this device is already playing as, or null on a fresh device. */
  playerId: string | null;
  email: string;
}

export interface ClaimResult {
  /** The identity the device should carry from here on. */
  playerId: string;
  /** True when a second row was folded away to get here. */
  merged: boolean;
}

/**
 * Binds an address to a player, and resolves the case where that address turns
 * out to belong to a row the device has never heard of.
 *
 * Called only after the one-time code has been verified — this function assumes
 * the address is proven and does not check it.
 *
 * The three outcomes:
 *   - nobody holds the address  -> bind it to the device's player
 *   - the device's own player holds it -> nothing to do
 *   - somebody else holds it    -> that row is the person; merge into it
 */
export async function claimIdentity(
  client: PrismaClient,
  request: ClaimRequest,
): Promise<ClaimResult> {
  const email = normaliseEmail(request.email);
  if (email === null) throw new EmailInvalidError();

  const holder = await client.player.findUnique({
    where: { email },
    select: { id: true, mergedIntoId: true },
  });

  // A fresh device with nothing of its own: pure recovery, nothing to merge.
  if (request.playerId === null) {
    if (holder === null) throw new IdentityNotFoundError();
    return { playerId: holder.mergedIntoId ?? holder.id, merged: false };
  }

  if (holder === null) {
    await client.player.update({
      where: { id: request.playerId },
      data: { email, emailClaimedAt: new Date() },
    });
    return { playerId: request.playerId, merged: false };
  }

  // Follow the tombstone: a stale identity token for a row that was already
  // merged must land on the survivor, not resurrect the row it points at.
  const canonicalId = holder.mergedIntoId ?? holder.id;
  if (canonicalId === request.playerId) return { playerId: canonicalId, merged: false };

  const device = await client.player.findUnique({
    where: { id: request.playerId },
    select: { mergedIntoId: true },
  });
  // This device has already been merged into the same person: nothing left to do.
  if (device?.mergedIntoId === canonicalId) return { playerId: canonicalId, merged: false };

  // Refuses of its own accord when the device holds a claimed address already —
  // two claimed addresses are two people, and that is not ours to collapse.
  await mergePlayers(client, { orphanId: request.playerId, canonicalId });

  return { playerId: canonicalId, merged: true };
}
