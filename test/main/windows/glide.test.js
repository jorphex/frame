import { GlideDetector, isAtRightEdge } from '../../../main/windows/glide'

const display = {
  workArea: { x: 0, y: 48, width: 3840, height: 2112 }
}

const createScreen = (point) => ({
  getCursorScreenPoint: jest.fn(() => point),
  getDisplayNearestPoint: jest.fn(() => display)
})

describe('isAtRightEdge', () => {
  it('accepts the final two pixels of the usable right edge', () => {
    expect(isAtRightEdge({ x: 3838, y: 1080 }, display)).toBe(true)
    expect(isAtRightEdge({ x: 3839, y: 1080 }, display)).toBe(true)
  })

  it('rejects nearby and vertically reserved screen coordinates', () => {
    expect(isAtRightEdge({ x: 3837, y: 1080 }, display)).toBe(false)
    expect(isAtRightEdge({ x: 3839, y: 48 }, display)).toBe(false)
    expect(isAtRightEdge({ x: 3839, y: 2160 }, display)).toBe(false)
  })
})

describe('GlideDetector', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('retries when the window lifecycle temporarily rejects a reveal', () => {
    const screen = createScreen({ x: 3839, y: 1080 })
    const reveal = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const detector = new GlideDetector(screen, () => true, reveal)

    detector.start()
    jest.advanceTimersByTime(100)

    expect(reveal).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(500)
    expect(reveal).toHaveBeenCalledTimes(2)
  })

  it('does not create duplicate polling loops', () => {
    const screen = createScreen({ x: 100, y: 100 })
    const reveal = jest.fn(() => false)
    const detector = new GlideDetector(screen, () => true, reveal)

    detector.start()
    detector.start()

    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(50)
    expect(jest.getTimerCount()).toBe(1)
    detector.stop()
  })

  it('stops polling when Glide is disabled', () => {
    let enabled = true
    const screen = createScreen({ x: 100, y: 100 })
    const detector = new GlideDetector(
      screen,
      () => enabled,
      jest.fn(() => false)
    )

    detector.start()
    enabled = false
    jest.advanceTimersByTime(500)

    expect(screen.getCursorScreenPoint).toHaveBeenCalledTimes(1)
  })
})
