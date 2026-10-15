import type { Timestamp } from 'firebase/firestore'
import type { Cadence, Weekday } from './task'
import type { TaskSnapshot } from './group'

export type CompletionValues = Record<string, number | string | boolean | null>

export interface Completion {
  id: string
  userId: string
  groupId: string
  taskId: string
  taskVersionId: string
  taskName: string
  cadence: Cadence
  periodKey: string
  weekStartsOn: Extract<Weekday, 0 | 1>
  completedAt: Timestamp
  loggedAt: Timestamp
  values: CompletionValues
  note: string | null
  taskSnapshot: TaskSnapshot
  deletedAt: Timestamp | null
}
