import type { User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { INVITE_TOKEN_RE, maskEmail } from './invites'

export class InviteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid'
      | 'not-found'
      | 'wrong-email'
      | 'unverified'
      | 'used'
      | 'expired'
      | 'already-member',
  ) {
    super(message)
  }
}

/**
 * Accept an invite as the signed-in user. Reads the invite (rules only allow the invitee to see it),
 * then writes the profile and marks the invite accepted in one batch, which the rules validate
 * together via get()/getAfter().
 */
export async function acceptInvite(db: Firestore, user: User, token: string, timezone: string): Promise<void> {
  if (!INVITE_TOKEN_RE.test(token)) throw new InviteError('This invite link is not valid.', 'invalid')
  const email = (user.email ?? '').toLowerCase()
  if (!email || !user.emailVerified) {
    throw new InviteError('Your sign-in method did not verify your email address.', 'unverified')
  }

  const inviteRef = doc(db, 'invites', token)
  let snap
  try {
    snap = await getDoc(inviteRef)
  } catch {
    // Permission denied: the invite exists but is for a different address, or does not exist.
    throw new InviteError(
      'This invite was sent to a different email address. Sign in with that address, or ask the admin to re-invite you.',
      'wrong-email',
    )
  }
  if (!snap.exists()) throw new InviteError('This invite does not exist.', 'not-found')
  const invite = snap.data()
  if (invite.email !== email) {
    throw new InviteError(`This invite was sent to ${maskEmail(invite.email)}.`, 'wrong-email')
  }
  if (invite.status !== 'pending') throw new InviteError('This invite has already been used or revoked.', 'used')
  if (invite.expiresAt.toMillis() < Date.now()) throw new InviteError('This invite has expired.', 'expired')

  const batch = writeBatch(db)
  batch.update(inviteRef, { status: 'accepted', acceptedAt: serverTimestamp(), acceptedBy: user.uid })
  batch.set(doc(db, 'users', user.uid), {
    email,
    displayName: user.displayName || email.split('@')[0],
    photoURL: user.photoURL ?? null,
    role: 'user',
    timezone,
    status: 'active',
    inviteToken: token,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}
