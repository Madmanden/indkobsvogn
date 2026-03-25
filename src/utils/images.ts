const MAX_IMAGE_DIMENSION = 1600
const MAX_ORIGINAL_FILE_BYTES = 350 * 1024
const JPEG_QUALITY = 0.88

export function scaleDimensions(
  width: number,
  height: number,
  maxDimension = MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxDimension, height: maxDimension }
  }

  const largestDimension = Math.max(width, height)
  if (largestDimension <= maxDimension) {
    return { width, height }
  }

  const scale = maxDimension / largestDimension
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Kunne ikke laese filen.'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Kunne ikke laese filen.'))
    }
    reader.readAsDataURL(file)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Kunne ikke indlaese billedet.'))
    }

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.src = objectUrl
  })
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Kunne ikke komprimere billedet.'))
          return
        }

        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Kunne ikke laese det komprimerede billede.'))
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result)
            return
          }

          reject(new Error('Kunne ikke laese det komprimerede billede.'))
        }
        reader.readAsDataURL(blob)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export async function readFileAsOptimizedDataUrl(file: File): Promise<string> {
  const image = await loadImage(file)
  const scaled = scaleDimensions(image.naturalWidth, image.naturalHeight)
  const shouldKeepOriginal =
    file.size <= MAX_ORIGINAL_FILE_BYTES &&
    scaled.width === image.naturalWidth &&
    scaled.height === image.naturalHeight

  if (shouldKeepOriginal) {
    return readFileAsDataUrl(file)
  }

  const canvas = document.createElement('canvas')
  canvas.width = scaled.width
  canvas.height = scaled.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Kunne ikke klargoere billedet.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  return canvasToJpegDataUrl(canvas)
}
