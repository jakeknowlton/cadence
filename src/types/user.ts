import type { Timestamp } from 'firebase/firestore'

export type Role = 'user' | 'admin'
export type UserStatus = 'active' | 'deactivated'

export interface UserProfile {
  id: string
  email: string
  displayName: string
  photoURL: string | null
  role: Role
  timezone: string
  status: UserStatus
  inviteToken?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

/** Document id is the invite token. */
export interface Invite {
  id: string
  email: string
  invitedBy: string
  status: InviteStatus
  createdAt: Timestamp
  expiresAt: Timestamp
  acceptedAt?: Timestamp
  acceptedBy?: string
}
