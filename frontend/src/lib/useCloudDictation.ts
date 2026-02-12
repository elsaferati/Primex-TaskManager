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
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
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

export function useCloudDictation(options: UseCloudDictationOptions) {
  const { apiFetch, onFinalText, lang } = options

  const [isSupported, setIsSupported] = React.useState(false)
  const [isRecording, setIsRecording] = React.useState(false)
  const [isTranscribing, setIsTranscribing] = React.useState(false)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const mimeTypeRef = React.useRef<string | undefined>(undefined)

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
      if (blob.size > MAX_CLOUD_AUDIO_BYTES) {
        toast.error(`Audio too large. Max ${MAX_CLOUD_AUDIO_MB}MB.`)
        return
      }

      const mimeType = mimeTypeRef.current || blob.type
      const ext = extensionForMimeType(mimeType)
      const formData = new FormData()
      formData.append("file", blob, `dictation.${ext}`)
      if (lang) formData.append("language", lang)

      const res = await apiFetch("/speech/transcribe", {
        method: "POST",
        body: formData,
      })

      if (!res?.ok) {
        let message = "Transcription failed"
        try {
          const data = (await res?.json()) as { detail?: string }
          if (data?.detail) message = data.detail
        } catch {
          // ignore
        }
        toast.error(message)
        return
      }

      try {
        const data = (await res.json()) as { text?: string }
        const text = (data.text || "").trim()
        if (text) onFinalText(text)
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
    if (isRecording || isTranscribing) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice dictation not supported in this browser")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickRecorderMimeType()
      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        toast.error("Recording failed")
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || undefined })
        chunksRef.current = []
        cleanupStream()
        setIsRecording(false)
        setIsTranscribing(true)
        await transcribe(blob)
        setIsTranscribing(false)
      }

      recorder.start()
      setIsRecording(true)
    } catch {
      cleanupStream()
      toast.error("Microphone access denied")
    }
  }, [cleanupStream, isRecording, isTranscribing, transcribe])

  const toggle = React.useCallback(() => {
    if (isRecording) stop()
    else void start()
  }, [isRecording, start, stop])

  React.useEffect(() => {
    return () => {
      stop()
      cleanupStream()
    }
  }, [cleanupStream, stop])

  return { isSupported, isRecording, isTranscribing, start, stop, toggle }
}
