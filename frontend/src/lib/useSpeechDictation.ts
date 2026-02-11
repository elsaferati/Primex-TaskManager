"use client"

import * as React from "react"
import { toast } from "sonner"

type ArrayLikeUnknown = {
  length: number
  [index: number]: unknown
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  onresult: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike

type UseSpeechDictationOptions = {
  lang?: string
  onFinalText: (text: string) => void
}

function isArrayLike(value: unknown): value is ArrayLikeUnknown {
  if (!value || typeof value !== "object") return false
  const lengthValue = (value as { length?: unknown }).length
  return typeof lengthValue === "number"
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructorLike
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function getProp(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined
  return (value as Record<string, unknown>)[key]
}

function speechErrorToMessage(event: unknown): string {
  const code = String(getProp(event, "error") ?? getProp(event, "name") ?? "").toLowerCase()
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone access denied"
  }
  if (code === "audio-capture") {
    return "No microphone found"
  }
  if (code === "no-speech") {
    return "No speech detected"
  }
  if (code === "network") {
    return "Network error during dictation"
  }
  if (code === "language-not-supported") {
    return "Dictation language not supported"
  }
  if (code === "aborted") {
    return ""
  }
  const message = String(getProp(event, "message") ?? "").trim()
  return message ? `Voice dictation failed: ${message}` : "Voice dictation failed"
}

export function useSpeechDictation(options: UseSpeechDictationOptions) {
  const { onFinalText, lang = "en-US" } = options

  const [isListening, setIsListening] = React.useState(false)
  const [interimText, setInterimText] = React.useState("")
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)

  const [isSupported, setIsSupported] = React.useState(false)

  React.useEffect(() => {
    setIsSupported(Boolean(getSpeechRecognitionConstructor()))
  }, [])

  const stop = React.useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    setIsListening(false)
    setInterimText("")
    if (!recognition) return
    try {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.stop()
    } catch {
      // ignore
    }
  }, [])

  const start = React.useCallback(() => {
    if (isListening) return
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    const recognition = new Ctor()
    const processedFinalIndexes = new Set<number>()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = lang

    recognition.onresult = (event: unknown) => {
      const resultIndexValue = getProp(event, "resultIndex")
      const resultIndex = typeof resultIndexValue === "number" ? resultIndexValue : 0
      const resultsValue = getProp(event, "results")
      const results = isArrayLike(resultsValue) ? resultsValue : null

      const finals: string[] = []
      let interim = ""

      const resultsLen = results ? results.length : 0
      for (let i = resultIndex; i < resultsLen; i++) {
        const result = results?.[i]
        if (!isArrayLike(result)) continue
        const alt0 = result[0]
        const transcript = String(getProp(alt0, "transcript") ?? "")
        if (!transcript) continue
        if (Boolean(getProp(result, "isFinal"))) {
          if (!processedFinalIndexes.has(i)) {
            processedFinalIndexes.add(i)
            finals.push(transcript)
          }
        } else {
          interim += transcript
        }
      }

      setInterimText(interim.trim())
      finals
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => onFinalText(value))
    }

    recognition.onerror = (event: unknown) => {
      const message = speechErrorToMessage(event)
      setIsListening(false)
      setInterimText("")
      recognitionRef.current = null
      if (message) toast.error(message)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimText("")
      recognitionRef.current = null
    }

    try {
      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    } catch (error) {
      recognitionRef.current = null
      setIsListening(false)
      setInterimText("")
      const message = speechErrorToMessage(error) || "Voice dictation failed"
      toast.error(message)
    }
  }, [isListening, lang, onFinalText])

  const toggle = React.useCallback(() => {
    if (isListening) stop()
    else start()
  }, [isListening, start, stop])

  React.useEffect(() => {
    return () => stop()
  }, [stop])

  return { isSupported, isListening, interimText, start, stop, toggle }
}
