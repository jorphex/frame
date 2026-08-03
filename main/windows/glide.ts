type Point = { x: number; y: number }
type Rectangle = Point & { width: number; height: number }

type Display = {
  workArea: Rectangle
}

type Screen = {
  getCursorScreenPoint(): Point
  getDisplayNearestPoint(point: Point): Display
}

type Lifecycle = {
  start(): void
  stop(): void
}

const sampleInterval = 50
const edgeTolerance = 2
const verticalMargin = 5

export function isAtRightEdge(point: Point, display: Display) {
  const { workArea } = display
  const right = workArea.x + workArea.width - 1

  return (
    point.x >= right - edgeTolerance + 1 &&
    point.y >= workArea.y + verticalMargin &&
    point.y <= workArea.y + workArea.height - verticalMargin
  )
}

export class GlideDetector {
  private running = false
  private timeout: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly screen: Screen,
    private readonly enabled: () => boolean,
    private readonly reveal: () => boolean,
    private readonly lifecycle?: Lifecycle
  ) {}

  start() {
    if (this.running || !this.enabled()) return

    this.running = true
    this.lifecycle?.start()
    this.poll()
  }

  stop() {
    const wasRunning = this.running
    this.running = false
    clearTimeout(this.timeout)
    this.timeout = undefined
    if (wasRunning) this.lifecycle?.stop()
  }

  private poll() {
    if (!this.running || !this.enabled()) {
      this.stop()
      return
    }

    const initialPoint = this.screen.getCursorScreenPoint()
    const initialDisplay = this.screen.getDisplayNearestPoint(initialPoint)

    this.timeout = setTimeout(() => {
      this.timeout = undefined
      if (!this.running || !this.enabled()) {
        this.stop()
        return
      }

      const currentPoint = this.screen.getCursorScreenPoint()
      const currentDisplay = this.screen.getDisplayNearestPoint(currentPoint)
      const dwellingAtEdge =
        isAtRightEdge(initialPoint, initialDisplay) && isAtRightEdge(currentPoint, currentDisplay)

      if (dwellingAtEdge && this.reveal()) {
        this.stop()
        return
      }

      this.poll()
    }, sampleInterval)
  }
}
