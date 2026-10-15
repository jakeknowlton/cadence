import type { Timestamp } from 'firebase/firestore'

export interface InboxItem {
  id: string
  type: 'member_completion'
  groupId: string
  actorId: string
  actorName: string
  taskId: string
  taskName: string
  completionId: string
  periodKey: string
  createdAt: Timestamp
  readAt: Timestamp | null
}
