import { CameraError, type CameraScanner } from './attendanceScan.js'

/** Minimal shape of the Shape Detection API's BarcodeDetector (not in TS lib.dom). */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike

const SCAN_INTERVAL_MS = 250

/**
 * Real camera transport: getUserMedia plus the browser's BarcodeDetector.
 * Verified only by the manual smoke check in docs/attendance-scanning.md.
 */
export interface BrowserCameraApis {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>
  BarcodeDetector?: BarcodeDetectorCtor
}

function defaultApis(): BrowserCameraApis {
  return {
    mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
    BarcodeDetector: (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector,
  }
}

/** Maps a getUserMedia rejection (matched by error name, not DOMException identity) to a camera failure. */
function cameraFailure(error: unknown): CameraError {
  const name = (error as { name?: unknown } | null)?.name
  return new CameraError(name === 'NotAllowedError' || name === 'SecurityError' ? 'permission-denied' : 'unavailable')
}

export function createBrowserCameraScanner(apis: () => BrowserCameraApis = defaultApis): CameraScanner {
  return {
    async start(onPayload) {
      const { mediaDevices, BarcodeDetector: Detector } = apis()
      if (!Detector || !mediaDevices?.getUserMedia) throw new CameraError('unavailable')
      let stream: MediaStream
      try {
        stream = await mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch (error) {
        throw cameraFailure(error)
      }
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play()
      const detector = new Detector({ formats: ['qr_code'] })
      let active = true
      const timer = setInterval(() => {
        if (!active || video.readyState < 2) return
        detector.detect(video).then(
          codes => codes.forEach(code => active && onPayload(code.rawValue)),
          () => {} // a failed frame is not a scan; try the next one
        )
      }, SCAN_INTERVAL_MS)
      return {
        stop() {
          active = false
          clearInterval(timer)
          stream.getTracks().forEach(track => track.stop())
          video.srcObject = null
        },
      }
    },
  }
}
