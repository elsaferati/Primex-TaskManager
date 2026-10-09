const MEETING_ALARM_REPEAT_MS = 2_000
let audioContext: AudioContext | null = null
let meetingAlarmTimer: number | null = null
const activeTones = new Set<OscillatorNode>()

function getAudioContext() {
  if (typeof window === "undefined") return null
  if (!audioContext || audioContext.state === "closed") {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass()
  }
  return audioContext
}

// Call from a user gesture, without sounding an alert on ordinary clicks.
export async function unlockMeetingReminderAudio(): Promise<boolean> {
  try {
    const context = getAudioContext()
    if (!context) return false
    if (context.state !== "running") await context.resume()
    return context.state === "running"
  } catch {
    return false
  }
}

export function playMeetingReminderSound(): boolean {
  try {
    const context = getAudioContext()
    if (!context || context.state !== "running") return false
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5)
    oscillator.connect(gain)
    gain.connect(context.destination)
    activeTones.add(oscillator)
    oscillator.addEventListener("ended", () => {
      activeTones.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    }, { once: true })
    oscillator.start()
    oscillator.stop(context.currentTime + 0.5)
    return true
  } catch {
    return false
  }
}

export function stopMeetingReminderAlarm() {
  if (meetingAlarmTimer !== null) window.clearInterval(meetingAlarmTimer)
  meetingAlarmTimer = null
  for (const oscillator of activeTones) {
    try { oscillator.stop() } catch { /* Already ended. */ }
    oscillator.disconnect()
  }
  activeTones.clear()
}

export function startMeetingReminderAlarm() {
  stopMeetingReminderAlarm()
  playMeetingReminderSound()
  meetingAlarmTimer = window.setInterval(playMeetingReminderSound, MEETING_ALARM_REPEAT_MS)
}

export function listenForMeetingAudioUnlock(): () => void {
  const unlock = () => {
    void unlockMeetingReminderAudio().then((ready) => {
      if (ready && meetingAlarmTimer !== null && activeTones.size === 0) playMeetingReminderSound()
    })
  }
  window.addEventListener("pointerdown", unlock, true)
  window.addEventListener("keydown", unlock, true)
  return () => {
    window.removeEventListener("pointerdown", unlock, true)
    window.removeEventListener("keydown", unlock, true)
  }
}
