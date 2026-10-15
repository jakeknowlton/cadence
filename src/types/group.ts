import type { Timestamp } from 'firebase/firestore'
import type { Cadence, TaskDefinition, Weekday } from './task'

export interface Group {
  id: string
  name: string
  description: string
  icon: string
  color: string
  memberIds: string[]
  formerMemberIds: string[]
  weekStartsOn: Extract<Weekday, 0 | 1>
  weekStartLocked: boolean
  editWindowDays: number
  archivedAt: Timestamp | null
  createdAt: Timestamp
  createdBy: string
}

export interface NotificationPrefs {
  onMemberCompletion: {
    enabled: boolean
    cadences: Cadence[]
    /** null = every task */
    taskIds: string[] | null
  }
}

export interface Membership {
  /** = userId */
  id: string
  userId: string
  joinedAt: Timestamp
  leftAt: Timestamp | null
  notifications: NotificationPrefs
}

/** The measured part of a task definition, copied verbatim onto every completion. */
export type TaskSnapshot = Pick<
  TaskDefinition,
  'cadence' | 'activeDays' | 'requiredCount' | 'completionType' | 'fields'
> & { target: TaskDefinition['target'] | null }

export interface TaskVersionDoc extends Omit<TaskDefinition, 'target'> {
  id: string
  taskId: string
  version: number
  prevVersionId: string | null
  /** taskId of a retired task this one replaced, display only */
  replaces: string | null
  effectiveFrom: string
  effectiveTo: string | null
  target: TaskDefinition['target'] | null
  fieldKeys: string[]
  /** key -> 'type|unit', cumulative over the task's lineage */
  fieldTypes: Record<string, string>
  snapshot: TaskSnapshot
  createdAt: Timestamp
  createdBy: string
}

export const GROUP_COLORS = ['zinc', 'red', 'orange', 'amber', 'green', 'teal', 'sky', 'indigo', 'violet', 'pink'] as const
export type GroupColor = (typeof GROUP_COLORS)[number]
