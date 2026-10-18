export type Cadence = 'daily' | 'weekly' | 'monthly'

/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type FieldType = 'number' | 'duration' | 'text' | 'boolean' | 'select'

export interface TaskField {
  key: string
  label: string
  type: FieldType
  unit?: string
  required: boolean
  /** number and duration: a value outside min/max is saved but the completion doesn't count */
  min?: number
  max?: number
  /** number: entries are rounded to the nearest multiple when saved */
  step?: number
  options?: string[]
  /** set by the admin, never inferred; a one-tap log uses every field's default */
  default?: unknown
}

/** The editable definition of a task, independent of versioning metadata. */
export interface TaskDefinition {
  // cosmetic
  name: string
  description?: string
  icon?: string
  sortOrder: number
  // measured
  cadence: Cadence
  activeDays: Weekday[] | null
  requiredCount: number
  completionType: 'checkbox' | 'fields'
  fields: TaskField[]
}
