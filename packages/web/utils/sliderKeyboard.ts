/**
 * Slider 键盘操作的纯函数（可访问性：role="slider" 需支持方向键/Home/End）。
 * 返回 null 表示该按键不影响值。
 */
export function nextSliderValue(
  key: string,
  value: number,
  { min, max, step }: { min: number; max: number; step: number }
): number | null {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(value + step)
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(value - step)
    case 'Home':
      return min
    case 'End':
      return max
    default:
      return null
  }
}
