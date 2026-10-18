import { describe, expect, it } from 'vitest'
import type { TaskDefinition } from '@/types/task'
import { classifyEdit, validateDefinition } from './taskEdits'

const run: TaskDefinition = {
  name: 'Run a mile',
  description: 'Any pace',
  icon: 'PersonSimpleRun',
  sortOrder: 1,
  cadence: 'daily',
  activeDays: null,
  requiredCount: 1,
  completionType: 'fields',
  fields: [
    { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, min: 0, step: 0.1, default: 1 },
    { key: 'time', label: 'Time', type: 'duration', required: false },
  ],
  target: { fieldKey: 'miles', comparator: '>=', value: 1 },
}

function edit(patch: Partial<TaskDefinition>): TaskDefinition {
  return { ...run, ...patch }
}

describe('classifyEdit', () => {
  it('identical definitions are no edit', () => {
    expect(classifyEdit(run, { ...run }).class).toBe('none')
  })

  it('name, description, icon, sort order, and field labels are cosmetic', () => {
    expect(classifyEdit(run, edit({ name: 'Run' })).class).toBe('cosmetic')
    expect(classifyEdit(run, edit({ description: undefined })).class).toBe('cosmetic')
    expect(classifyEdit(run, edit({ icon: 'Sneaker' })).class).toBe('cosmetic')
    expect(classifyEdit(run, edit({ sortOrder: 5 })).class).toBe('cosmetic')
    const relabelled = edit({ fields: [{ ...run.fields[0]!, label: 'Miles' }, run.fields[1]!] })
    expect(classifyEdit(run, relabelled).class).toBe('cosmetic')
  })

  it('cadence, active days, required count, completion type, and target are measured', () => {
    expect(classifyEdit(run, edit({ cadence: 'weekly' })).class).toBe('measured')
    expect(classifyEdit(run, edit({ activeDays: [1, 2, 3, 4, 5] })).class).toBe('measured')
    expect(classifyEdit(run, edit({ requiredCount: 2 })).class).toBe('measured')
    expect(classifyEdit(run, edit({ target: { ...run.target!, value: 2 } })).class).toBe('measured')
    expect(classifyEdit(run, edit({ target: { ...run.target!, comparator: '==' } })).class).toBe('measured')
    expect(classifyEdit(run, edit({ target: undefined })).class).toBe('measured')
  })

  it('adding or removing a field is measured', () => {
    expect(classifyEdit(run, edit({ fields: [run.fields[0]!] })).class).toBe('measured')
    const added = edit({ fields: [...run.fields, { key: 'notes', label: 'Notes', type: 'text', required: false }] })
    expect(classifyEdit(run, added).class).toBe('measured')
  })

  it('field required/min/max/step/options/default are measured', () => {
    for (const patch of [{ required: false }, { min: 0.5 }, { max: 100 }, { step: 1 }, { default: 2 }]) {
      const changed = edit({ fields: [{ ...run.fields[0]!, ...patch }, run.fields[1]!] })
      expect(classifyEdit(run, changed).class).toBe('measured')
    }
  })

  it('changing a field type or unit is refused', () => {
    const km = edit({ fields: [{ ...run.fields[0]!, unit: 'km' }, run.fields[1]!] })
    expect(classifyEdit(run, km).class).toBe('refused')
    const text = edit({ fields: [{ ...run.fields[0]!, type: 'text' }, run.fields[1]!] })
    expect(classifyEdit(run, text).class).toBe('refused')
  })

  it('re-adding a previously removed key with a different type or unit is refused', () => {
    const without = edit({ fields: [run.fields[1]!], target: undefined })
    const readded = edit({ fields: [{ key: 'miles', label: 'Distance', type: 'number', unit: 'km', required: false }, run.fields[1]!], target: undefined })
    expect(classifyEdit(without, readded, { miles: 'number|mi' }).class).toBe('refused')
    const readdedSame = edit({ fields: [{ key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: false }, run.fields[1]!], target: undefined })
    expect(classifyEdit(without, readdedSame, { miles: 'number|mi' }).class).toBe('measured')
  })

  it('refused outranks measured outranks cosmetic, and reasons list everything', () => {
    const mixed = edit({ name: 'Run far', cadence: 'weekly', fields: [{ ...run.fields[0]!, unit: 'km' }, run.fields[1]!] })
    const result = classifyEdit(run, mixed)
    expect(result.class).toBe('refused')
    expect(result.reasons.some((r) => r.includes('unit'))).toBe(true)
    expect(result.reasons.some((r) => r.includes('cadence'))).toBe(true)
    expect(result.reasons.some((r) => r.includes('name'))).toBe(true)
  })
})

describe('validateDefinition', () => {
  it('accepts the example', () => {
    expect(validateDefinition(run)).toEqual([])
  })
  it('requires a name and a positive whole required count', () => {
    expect(validateDefinition(edit({ name: ' ' }))).toContain('Name is required')
    expect(validateDefinition(edit({ requiredCount: 0 })).length).toBe(1)
    expect(validateDefinition(edit({ requiredCount: 1.5 })).length).toBe(1)
  })
  it('active days only on daily tasks, and never empty', () => {
    expect(validateDefinition(edit({ cadence: 'weekly', activeDays: [1] }))).toContain('Active days apply to daily tasks only')
    expect(validateDefinition(edit({ activeDays: [] }))).toContain('A daily task must be active on at least one day')
  })
  it('checkbox tasks have no fields; field tasks need one', () => {
    expect(validateDefinition(edit({ completionType: 'checkbox' }))).toContain('A checkbox task has no fields')
    expect(validateDefinition(edit({ fields: [], target: undefined }))).toContain('A fields task needs at least one field')
  })
  it('a goal must be on a required field', () => {
    expect(validateDefinition(run)).toEqual([])
    const optional = edit({ fields: [{ ...run.fields[0]!, required: false }, run.fields[1]!] })
    expect(validateDefinition(optional)).toContain('A goal must be on a required field')
  })
  it('rounding must be positive', () => {
    expect(validateDefinition(edit({ fields: [{ ...run.fields[0]!, step: 0 }, run.fields[1]!] }))).toContain('Field "miles" must round to a number above 0')
    expect(validateDefinition(edit({ fields: [{ ...run.fields[0]!, step: 0.1 }, run.fields[1]!] }))).toEqual([])
  })
  it('the goal must be reachable inside the field min and max', () => {
    const withRange = (min: number | undefined, max: number | undefined, target: NonNullable<typeof run.target>) =>
      validateDefinition(edit({ fields: [{ ...run.fields[0]!, min, max }, run.fields[1]!], target }))
    const msg = "The goal must fall within Distance's min and max"
    expect(withRange(0, 3, { fieldKey: 'miles', comparator: '>=', value: 5 })).toContain(msg)
    expect(withRange(2, undefined, { fieldKey: 'miles', comparator: '>=', value: 1 })).toContain(msg) // one-tap default below min
    expect(withRange(2, 10, { fieldKey: 'miles', comparator: '<=', value: 1 })).toContain(msg)
    expect(withRange(5, 10, { fieldKey: 'miles', comparator: 'between', value: 1, valueMax: 3 })).toContain(msg)
    expect(withRange(0, 10, { fieldKey: 'miles', comparator: '<=', value: 20 })).toEqual([])
    expect(withRange(0, 10, { fieldKey: 'miles', comparator: 'between', value: 8, valueMax: 12 })).toEqual([])
    expect(withRange(0, 10, { fieldKey: 'miles', comparator: 'between', value: 5, valueMax: 2 })).toContain('A "between" goal needs its first value to be the smaller one')
  })
  it('target must point at a numeric field that exists', () => {
    expect(validateDefinition(edit({ target: { ...run.target!, fieldKey: 'nope' } }))[0]).toMatch(/unknown field/)
    const onText = edit({ fields: [{ key: 'note', label: 'Note', type: 'text', required: true }], target: { fieldKey: 'note', comparator: '>=', value: 1 } })
    expect(validateDefinition(onText)).toContain('Target field must be a number or duration')
  })
})
