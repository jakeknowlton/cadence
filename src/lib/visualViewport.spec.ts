import { describe, expect, it } from 'vitest'
import { keyboardInset } from './visualViewport'

describe('keyboardInset', () => {
  it('is the part of the layout viewport below the visible area', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0)
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336)
    // iOS scrolls the visible area up inside the page when focusing; the keyboard is what's left below it
    expect(keyboardInset(844, { height: 508, offsetTop: 120 })).toBe(216)
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0)
  })
})
