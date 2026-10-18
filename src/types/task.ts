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
  /** number and duration, per entry: an entry qualifies only if its value is within them */
  min?: number
  max?: number
  /** number and duration, per period: the sum over the period's entries must be within them */
  totalMin?: number
  totalMax?: number
  /** number: entries are rounded to the nearest multiple when saved */
  step?: number
  options?: string[]
  /** set by the admin, never inferred; a one-tap log uses every field's default */
  default?: unknown
}

/**
 * A chart on the stats page, defined by the admin. Its value is one field, or two fields divided or
 * multiplied, combined per week or month. Display only: never stored per completion or used for counting.
 */
export interface TaskChart {
  name: string
  a: string
  op?: '/' | '*'
  b?: string
  agg: 'sum' | 'avg' | 'min' | 'max'
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
  // display
  /** none or empty: one Total chart per number and duration field */
  charts?: TaskChart[]
}
