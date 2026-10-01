"use client"

import * as React from "react"
import { toast } from "sonner"

type UseCloudDictationOptions = {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response | null>
  onFinalText: (text: string) => void
  lang?: string
}

const MAX_CLOUD_AUDIO_MB = 20
const MAX_CLOUD_AUDIO_BYTES = MAX_CLOUD_AUDIO_MB * 1024 * 1024

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

function extensionForMimeType(mimeType?: string): string {
  if (!mimeType) return "webm"
  if (mimeType.includes("mp4")) return "mp4"
  if (mimeType.includes("ogg")) return "ogg"
  if (mimeType.includes("wav")) return "wav"
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3"
  return "webm"
}

function microphoneErrorToMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : ""

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access denied. Allow microphone access in the browser settings."
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone found"
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Microphone is unavailable or is being used by another app"
  }
  if (name === "AbortError") {
    return "Microphone request was interrupted"
  }

  return "Unable to start microphone"
}

export function useCloudDictation(options: UseCloudDictationOptions) {
  const { apiFetch, onFinalText, lang } = options

  const [isSupported, setIsSupported] = React.useState(false)
  const [isRecording, setIsRecording] = React.useState(false)
  const [isTranscribing, setIsTranscribing] = React.useState(false)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const startingRef = React.useRef(false)
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined"
    setIsSupported(supported)
  }, [])

  const cleanupStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const transcribe = React.useCallback(
    async (blob: Blob) => {
      if (!blob.size) {
        toast.error("No audio recorded. Please speak and try again.")
        return
      }
      if (blob.size > MAX_CLOUD_AUDIO_BYTES) {
        toast.error(`Audio too large. Max ${MAX_CLOUD_AUDIO_MB}MB.`)
        return
      }

      const mimeType = blob.type
      const ext = extensionForMimeType(mimeType)
      const formData = new FormData()
      formData.append("file", blob, `dictation.${ext}`)
      if (lang) formData.append("language", lang)

      const res = await apiFetch(`${window.location.origin}/api/speech/transcribe`, {
        method: "POST",
        body: formData,
      })

      if (!res?.ok) {
        // apiFetch already reports a failed connection. Avoid a second,
        // misleading transcription toast for the same network error.
        if (res?.statusText === "Network error" || res?.status === 499) return
        let message = res?.status === 413
          ? "Audio too large. Please try a shorter recording."
          : res?.status === 401
            ? "Your session expired. Please sign in again."
            : "Unable to transcribe audio. Please try again."
        try {
          const data = (await res?.json()) as { detail?: string }
          if (typeof data?.detail === "string") message = data.detail
        } catch {
          // ignore
        }
        toast.error(message)
        return
      }

      try {
        const data = (await res.json()) as { text?: string }
        const text = (data.text || "").trim()
        if (text && mountedRef.current) onFinalText(text)
        else if (!text) toast.error("No speech detected. Please try again.")
      } catch {
        toast.error("Invalid transcription response")
      }
    },
    [apiFetch, lang, onFinalText]
  )

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    } else {
      cleanupStream()
    }
    setIsRecording(false)
  }, [cleanupStream])

  const start = React.useCallback(async () => {
    if (startingRef.current || isRecording || isTranscribing) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice dictation not supported in this browser")
      return
    }

    startingRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mimeType = pickRecorderMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        recorder.onstop = null
        recorderRef.current = null
        chunksRef.current = []
        cleanupStream()
        setIsRecording(false)
        toast.error("Recording failed")
      }

      recorder.onstop = async () => {
        // Safari may choose its own format when no explicit type is supported.
        // Use the actual recorder/chunk type so MP4 is never named as WebM.
        const recordedType = recorder.mimeType || chunksRef.current[0]?.type || mimeType
        const blob = new Blob(chunksRef.current, { type: recordedType })
        chunksRef.current = []
        recorderRef.current = null
        cleanupStream()
        setIsRecording(false)
        setIsTranscribing(true)
        try {
          await transcribe(blob)
        } catch {
          toast.error("Unable to send audio. Please check your connection and try again.")
        } finally {
          if (mountedRef.current) setIsTranscribing(false)
        }
      }

      recorder.start(1000)
      setIsRecording(true)
    } catch (error) {
      cleanupStream()
      toast.error(microphoneErrorToMessage(error))
    } finally {
      startingRef.current = false
    }
  }, [cleanupStream, isRecording, isTranscribing, transcribe])

  const toggle = React.useCallback(() => {
    if (isRecording) stop()
    else void start()
  }, [isRecording, start, stop])

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state !== "inactive") recorder.stop()
      }
      recorderRef.current = null
      chunksRef.current = []
      cleanupStream()
    }
  }, [cleanupStream])

  return { isSupported, isRecording, isTranscribing, start, stop, toggle }
}
