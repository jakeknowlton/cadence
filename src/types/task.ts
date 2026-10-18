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
  min?: number
  max?: number
  step?: number
  options?: string[]
  default?: unknown
}

export interface TaskTarget {
  fieldKey: string
  comparator: '>=' | '<=' | '==' | 'between'
  value: number
  valueMax?: number
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
  target?: TaskTarget
}
