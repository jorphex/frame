import { PNG } from 'pngjs'

const SAMPLE_HEIGHT = 37

function mode(colors: string[]) {
  if (colors.length === 0) throw new Error('Cannot extract color from an empty image')

  const counts: Record<string, number> = {}
  let selected = colors[0]
  let maxCount = 0

  for (const color of colors) {
    counts[color] = (counts[color] || 0) + 1
    if (counts[color] > maxCount) {
      selected = color
      maxCount = counts[color]
    }
  }

  return selected
}

function textColor(r: number, g: number, b: number) {
  // http://alienryderflex.com/hsp.html
  return Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b)) > 127.5 ? 'black' : 'white'
}

export default function pixelColor(image: Electron.NativeImage) {
  const { data, width, height } = PNG.sync.read(image.toPNG())
  const limit = width * Math.min(height, SAMPLE_HEIGHT) * 4
  const colors = []

  for (let offset = 0; offset < limit; offset += 4) {
    colors.push(`${data[offset]}, ${data[offset + 1]}, ${data[offset + 2]}`)
  }

  const colorArray = mode(colors).split(', ').map(Number)

  return {
    background: `rgb(${colorArray.join(', ')})`,
    backgroundShade: `rgb(${colorArray.map((value) => Math.max(value - 5, 0)).join(', ')})`,
    backgroundLight: `rgb(${colorArray.map((value) => Math.min(value + 50, 255)).join(', ')})`,
    text: textColor(...(colorArray as [number, number, number]))
  }
}
