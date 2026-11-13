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
export function createBrowserCameraScanner(): CameraScanner {
  return {
    async start(onPayload) {
      const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      if (!Detector || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new CameraError('unavailable')
      }
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch (error) {
        const name = error instanceof DOMException ? error.name : ''
        throw new CameraError(name === 'NotAllowedError' || name === 'SecurityError' ? 'permission-denied' : 'unavailable')
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
