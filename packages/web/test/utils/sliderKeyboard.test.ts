import { describe, expect, it } from 'vitest'
import { nextSliderValue } from '@/web/utils/sliderKeyboard'

const opts = { min: 0, max: 100, step: 5 }

describe('nextSliderValue', () => {
  it('方向键按步长增减', () => {
    expect(nextSliderValue('ArrowRight', 50, opts)).toBe(55)
    expect(nextSliderValue('ArrowUp', 50, opts)).toBe(55)
    expect(nextSliderValue('ArrowLeft', 50, opts)).toBe(45)
    expect(nextSliderValue('ArrowDown', 50, opts)).toBe(45)
  })

  it('越界收敛到 min/max', () => {
    expect(nextSliderValue('ArrowRight', 98, opts)).toBe(100)
    expect(nextSliderValue('ArrowLeft', 2, opts)).toBe(0)
  })

  it('Home/End 跳到两端', () => {
    expect(nextSliderValue('Home', 50, opts)).toBe(0)
    expect(nextSliderValue('End', 50, opts)).toBe(100)
  })

  it('无关按键返回 null', () => {
    expect(nextSliderValue('Enter', 50, opts)).toBeNull()
    expect(nextSliderValue('a', 50, opts)).toBeNull()
  })
})
