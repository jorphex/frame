import { PNG } from 'pngjs'

import pixelColor from '../../../../main/windows/extractColors/pixelColor'

function imageFromPixels(width, height, pixels) {
  const png = new PNG({ width, height })
  png.data = Buffer.from(pixels)

  return {
    toPNG: () => PNG.sync.write(png)
  }
}

test('extracts the dominant rendered RGB color and derived colors', () => {
  const image = imageFromPixels(3, 1, [10, 20, 30, 255, 200, 210, 220, 0, 10, 20, 30, 128])

  expect(pixelColor(image)).toEqual({
    background: 'rgb(10, 20, 30)',
    backgroundShade: 'rgb(5, 15, 25)',
    backgroundLight: 'rgb(60, 70, 80)',
    text: 'white'
  })
})

test('uses only valid pixels when the image is shorter than the sample height', () => {
  const image = imageFromPixels(1, 1, [250, 250, 250, 255])

  expect(pixelColor(image)).toEqual({
    background: 'rgb(250, 250, 250)',
    backgroundShade: 'rgb(245, 245, 245)',
    backgroundLight: 'rgb(255, 255, 255)',
    text: 'black'
  })
})

test('ignores pixels below the 37-row sample', () => {
  const red = [200, 0, 0, 255]
  const blue = [0, 0, 200, 255]
  const green = [0, 200, 0, 255]
  const image = imageFromPixels(1, 38, [
    ...red,
    ...Array(17).fill(red).flat(),
    ...Array(18).fill(blue).flat(),
    ...green,
    ...blue
  ])

  expect(pixelColor(image).background).toBe('rgb(200, 0, 0)')
})

test('rejects malformed PNG data', () => {
  expect(() => pixelColor({ toPNG: () => Buffer.from('not a png') })).toThrow()
})
