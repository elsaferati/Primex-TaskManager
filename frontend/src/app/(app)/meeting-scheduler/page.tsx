"use client";

import * as React from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

type Department = { id: string; name: string };
type UserLookup = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email: string;
  department_id?: string | null;
};
type Standard = {
  id: string;
  name: string;
  meeting_type: "internal" | "external";
  default_duration_minutes: number;
  buffer_minutes: number;
  workday_start: string;
  workday_end: string;
};
type Validation = {
  can_create: boolean;
  errors: string[];
  warnings: string[];
  conflicts: Array<{
    source: string;
    title: string;
    starts_at: string;
    ends_at: string;
  }>;
};
type ScheduleRequest = {
  id: string;
  title: string;
  meeting_type: "internal" | "external";
  starts_at: string;
  ends_at: string;
  status: string;
  approval_count: number;
  approvals: Array<{ user_id: string; user_name: string; approved_at: string }>;
  client_email?: string | null;
  teams_url?: string | null;
  last_error?: string | null;
  rejection_reason?: string | null;
  rejected_by_user_id?: string | null;
  rejected_at?: string | null;
  created_by_user_id: string;
};
type CalendarItem = {
  id: string;
  source: string;
  title: string;
  meeting_type: string;
  starts_at: string;
  ends_at: string;
  status: string;
  teams_url?: string | null;
  microsoft_event_id?: string | null;
};
type MicrosoftEvent = {
  id: string;
  subject?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
};

const HOURS = Array.from({ length: 19 }, (_, index) => {
  const minutes = 8 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const mondayFor = (value: Date) => {
  const result = new Date(value);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
};
const addDays = (value: Date, days: number) => {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
};
const localDateTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00`);
const userLabel = (user: UserLookup) =>
  user.full_name || user.username || user.email;
const statusTone = (status: string) => {
  if (status === "CREATED")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status.includes("FAILED")) return "border-red-200 bg-red-50 text-red-800";
  if (status === "REJECTED")
    return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
};

export default function MeetingSchedulerPage() {
  const { apiFetch, user } = useAuth();
  const [weekStart, setWeekStart] = React.useState(() => mondayFor(new Date()));
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [users, setUsers] = React.useState<UserLookup[]>([]);
  const [standards, setStandards] = React.useState<Standard[]>([]);
  const [calendarItems, setCalendarItems] = React.useState<CalendarItem[]>([]);
  const [requests, setRequests] = React.useState<ScheduleRequest[]>([]);
  const [microsoftEvents, setMicrosoftEvents] = React.useState<
    MicrosoftEvent[]
  >([]);
  const [msConnected, setMsConnected] = React.useState(false);
  const [msCanWrite, setMsCanWrite] = React.useState(false);
  const [msCanManage, setMsCanManage] = React.useState(false);
  const [msAccountEmail, setMsAccountEmail] =
    React.useState("info@primexeu.com");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [validation, setValidation] = React.useState<Validation | null>(null);

  const [departmentId, setDepartmentId] = React.useState(
    user?.department_id || "",
  );
  const [meetingType, setMeetingType] = React.useState<"internal" | "external">(
    "external",
  );
  const [standardId, setStandardId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(isoDate(new Date()));
  const [selectedTime, setSelectedTime] = React.useState("09:00");
  const [duration, setDuration] = React.useState(60);
  const [participantIds, setParticipantIds] = React.useState<string[]>(
    user?.id ? [user.id] : [],
  );
  const [clientName, setClientName] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [standardName, setStandardName] = React.useState("");
  const [standardType, setStandardType] = React.useState<
    "internal" | "external"
  >("external");
  const [standardDuration, setStandardDuration] = React.useState(60);
  const [standardBuffer, setStandardBuffer] = React.useState(15);
  const [rejectingRequestId, setRejectingRequestId] = React.useState<
    string | null
  >(null);
  const [rejectionReason, setRejectionReason] = React.useState("");

  const days = React.useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const rangeStart = days[0].toISOString();
  const rangeEnd = addDays(days[4], 1).toISOString();
  const filteredUsers = React.useMemo(
    () =>
      users.filter(
        (candidate) =>
          !departmentId || candidate.department_id === departmentId,
      ),
    [departmentId, users],
  );

  React.useEffect(() => {
    if (!departmentId && user?.department_id)
      setDepartmentId(user.department_id);
    if (user?.id)
      setParticipantIds((current) => (current.length ? current : [user.id]));
  }, [departmentId, user]);

  const loadReferenceData = React.useCallback(async () => {
    const [departmentsRes, usersRes, standardsRes, msStatusRes] =
      await Promise.all([
        apiFetch("/departments"),
        apiFetch("/users/lookup"),
        apiFetch("/meeting-scheduler/standards"),
        apiFetch("/microsoft/status"),
      ]);
    if (departmentsRes.ok) setDepartments(await departmentsRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
    if (standardsRes.ok) setStandards(await standardsRes.json());
    if (msStatusRes.ok) {
      const status = (await msStatusRes.json()) as {
        connected?: boolean;
        can_write_calendar?: boolean;
        can_manage?: boolean;
        account_email?: string;
      };
      setMsConnected(Boolean(status.connected));
      setMsCanWrite(Boolean(status.can_write_calendar));
      setMsCanManage(Boolean(status.can_manage));
      if (status.account_email) setMsAccountEmail(status.account_email);
    }
  }, [apiFetch]);

  const loadSchedule = React.useCallback(async () => {
    const query = new URLSearchParams({ start: rangeStart, end: rangeEnd });
    if (departmentId) query.set("department_id", departmentId);
    const [calendarRes, requestsRes] = await Promise.all([
      apiFetch(`/meeting-scheduler/calendar?${query}`),
      apiFetch(`/meeting-scheduler/requests?${query}`),
    ]);
    if (calendarRes.ok) setCalendarItems(await calendarRes.json());
    if (requestsRes.ok) setRequests(await requestsRes.json());
    if (msConnected) {
      const eventsRes = await apiFetch(
        `/microsoft/events?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`,
      );
      if (eventsRes.ok) setMicrosoftEvents(await eventsRes.json());
    } else {
      setMicrosoftEvents([]);
    }
  }, [apiFetch, departmentId, msConnected, rangeEnd, rangeStart]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    void loadReferenceData().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadReferenceData]);
  React.useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  React.useEffect(() => {
    const matching = standards.find(
      (standard) => standard.meeting_type === meetingType,
    );
    if (!matching) {
      setStandardId("");
      return;
    }
    setStandardId(matching.id);
    setDuration(matching.default_duration_minutes);
  }, [meetingType, standards]);

  const payload = React.useMemo(() => {
    const start = localDateTime(selectedDate, selectedTime);
    const end = new Date(start.getTime() + duration * 60_000);
    return {
      title: title.trim(),
      meeting_type: meetingType,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      platform: meetingType === "external" ? "Teams" : null,
      client_name: clientName.trim() || null,
      client_email:
        meetingType === "external" ? clientEmail.trim() || null : null,
      notes: notes.trim() || null,
      department_id: departmentId,
      project_id: null,
      standard_id: standardId || null,
      participant_ids: participantIds,
    };
  }, [
    clientEmail,
    clientName,
    departmentId,
    duration,
    meetingType,
    notes,
    participantIds,
    selectedDate,
    selectedTime,
    standardId,
    title,
  ]);

  const validate = async () => {
    if (
      !payload.title ||
      !payload.department_id ||
      !payload.participant_ids.length
    ) {
      toast.error("Plotëso titullin, departamentin dhe pjesëmarrësit.");
      return null;
    }
    const response = await apiFetch("/meeting-scheduler/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      toast.error("Validimi dështoi.");
      return null;
    }
    const result = (await response.json()) as Validation;
    setValidation(result);
    return result;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const result = await validate();
      if (!result?.can_create) return;
      const response = await apiFetch("/meeting-scheduler/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        toast.error("Kërkesa nuk u krijua.", {
          description: await response.text(),
        });
        return;
      }
      toast.success("Kërkesa u dërgua për dy aprovime.");
      setValidation(null);
      await loadSchedule();
    } finally {
      setSaving(false);
    }
  };

  const requestAction = async (
    requestId: string,
    action: "approve" | "retry",
  ) => {
    const response = await apiFetch(
      `/meeting-scheduler/requests/${requestId}/${action}`,
      { method: "POST" },
    );
    if (!response.ok) {
      toast.error("Veprimi dështoi.", { description: await response.text() });
      return;
    }
    const updated = (await response.json()) as ScheduleRequest;
    toast.success(
      action === "approve"
        ? `Aprovimi u ruajt (${updated.approval_count}/2).`
        : "Veprimi u krye.",
    );
    await loadSchedule();
  };

  const rejectRequest = async (requestId: string) => {
    if (rejectionReason.trim().length < 2) {
      toast.error("Shkruaj arsyen e refuzimit.");
      return;
    }
    const response = await apiFetch(
      `/meeting-scheduler/requests/${requestId}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      },
    );
    if (!response.ok) {
      toast.error("Refuzimi dështoi.", { description: await response.text() });
      return;
    }
    toast.success("Kërkesa u refuzua.");
    setRejectingRequestId(null);
    setRejectionReason("");
    await loadSchedule();
  };

  const createStandard = async () => {
    if (!standardName.trim()) {
      toast.error("Shkruaj emrin e standardit.");
      return;
    }
    const response = await apiFetch("/meeting-scheduler/standards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: standardName.trim(),
        meeting_type: standardType,
        default_duration_minutes: standardDuration,
        buffer_minutes: standardBuffer,
        workday_start: "08:00",
        workday_end: "17:00",
        is_active: true,
      }),
    });
    if (!response.ok) {
      toast.error("Standardi nuk u krijua.", {
        description: await response.text(),
      });
      return;
    }
    toast.success("Standardi u krijua.");
    setStandardName("");
    const standardsRes = await apiFetch("/meeting-scheduler/standards");
    if (standardsRes.ok) setStandards(await standardsRes.json());
  };

  const chooseSlot = (day: Date, time: string) => {
    setSelectedDate(isoDate(day));
    setSelectedTime(time);
    setValidation(null);
    document
      .getElementById("meeting-request-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const slotItems = (day: Date, time: string) => {
    const key = `${isoDate(day)}T${time}`;
    const primeflow = calendarItems.filter((item) => {
      const local = new Date(item.starts_at);
      return (
        `${isoDate(local)}T${String(local.getHours()).padStart(2, "0")}:${String(Math.floor(local.getMinutes() / 30) * 30).padStart(2, "0")}` ===
        key
      );
    });
    const microsoft = microsoftEvents
      .filter((item) => {
        if (
          calendarItems.some(
            (existing) =>
              existing.microsoft_event_id &&
              existing.microsoft_event_id === item.id,
          )
        )
          return false;
        if (!item.starts_at) return false;
        const local = new Date(item.starts_at);
        return (
          `${isoDate(local)}T${String(local.getHours()).padStart(2, "0")}:${String(Math.floor(local.getMinutes() / 30) * 30).padStart(2, "0")}` ===
          key
        );
      })
      .map((item) => ({
        id: `ms:${item.id}`,
        source: "microsoft",
        title: item.subject || "Microsoft event",
        meeting_type: "microsoft",
        starts_at: item.starts_at!,
        ends_at: item.ends_at || item.starts_at!,
        status: "BUSY",
      }));
    return [...primeflow, ...microsoft];
  };

  const canApprove = user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Meeting Scheduler
          </h1>
          <p className="text-sm text-slate-500">
            TAK EXT krijohen në kalendarin qendror {msAccountEmail}; TAK INT
            ruhen në PrimeFlow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msCanManage ? (
            <Button
              variant="outline"
              onClick={async () => {
                const res = await apiFetch(
                  `/microsoft/authorize-url?redirect_to=${encodeURIComponent(window.location.href)}`,
                );
                if (res.ok) window.location.href = (await res.json()).url;
              }}
            >
              {msConnected && msCanWrite
                ? "Reconnect info@primexeu.com"
                : msConnected
                  ? "Upgrade Microsoft access"
                  : "Connect info@primexeu.com"}
            </Button>
          ) : (
            <span
              className={`rounded-full border px-3 py-2 text-xs font-medium ${msConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
            >
              {msConnected
                ? `${msAccountEmail} connected`
                : `${msAccountEmail} not connected`}
            </span>
          )}
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Orari javor
              </CardTitle>
              <CardDescription>
                Kliko një slot për ta propozuar.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-40 text-center text-sm font-medium">
                {isoDate(days[0])} – {isoDate(days[4])}
              </span>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Duke ngarkuar…
            </div>
          ) : (
            <div className="min-w-[900px] overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[72px_repeat(5,minmax(150px,1fr))] bg-slate-50">
                <div className="border-r p-2" />
                {days.map((day) => (
                  <div
                    key={isoDate(day)}
                    className="border-r p-2 text-center text-sm font-semibold last:border-r-0"
                  >
                    {day.toLocaleDateString("sq-AL", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </div>
                ))}
              </div>
              {HOURS.map((time) => (
                <div
                  key={time}
                  className="grid grid-cols-[72px_repeat(5,minmax(150px,1fr))] border-t"
                >
                  <div className="border-r px-2 py-2 text-xs font-medium text-slate-500">
                    {time}
                  </div>
                  {days.map((day) => {
                    const items = slotItems(day, time);
                    return (
                      <button
                        key={`${isoDate(day)}-${time}`}
                        type="button"
                        onClick={() => chooseSlot(day, time)}
                        className="min-h-14 border-r p-1 text-left transition hover:bg-blue-50 last:border-r-0"
                      >
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={`mb-1 truncate rounded border px-1.5 py-1 text-[10px] font-medium ${item.source === "microsoft" ? "border-violet-200 bg-violet-50 text-violet-800" : item.meeting_type === "external" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
                            title={item.title}
                          >
                            {item.title}
                          </div>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Card id="meeting-request-form">
          <CardHeader>
            <CardTitle>Propozo takim</CardTitle>
            <CardDescription>
              {selectedDate} në {selectedTime}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Lloji</Label>
                <Select
                  value={meetingType}
                  onValueChange={(value) => {
                    const nextType = value as "internal" | "external";
                    const matching = standards.find(
                      (item) => item.meeting_type === nextType,
                    );
                    setMeetingType(nextType);
                    setStandardId(matching?.id || "");
                    setDuration(
                      matching?.default_duration_minutes ||
                        (nextType === "external" ? 60 : 30),
                    );
                    setValidation(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">TAK EXT</SelectItem>
                    <SelectItem value="internal">TAK INT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Standardi</Label>
                <Select
                  value={standardId}
                  onValueChange={(value) => {
                    setStandardId(value);
                    const selected = standards.find(
                      (item) => item.id === value,
                    );
                    if (selected)
                      setDuration(selected.default_duration_minutes);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pa standard" />
                  </SelectTrigger>
                  <SelectContent>
                    {standards
                      .filter((item) => item.meeting_type === meetingType)
                      .map((standard) => (
                        <SelectItem key={standard.id} value={standard.id}>
                          {standard.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Titulli</Label>
              <Input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setValidation(null);
                }}
                placeholder="Titulli i takimit"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </div>
              <div>
                <Label>Ora</Label>
                <Input
                  type="time"
                  step={900}
                  value={selectedTime}
                  onChange={(event) => setSelectedTime(event.target.value)}
                />
              </div>
              <div>
                <Label>Minuta</Label>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={duration}
                  onChange={(event) =>
                    setDuration(Number(event.target.value) || 60)
                  }
                />
              </div>
            </div>
            {meetingType === "external" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Klienti</Label>
                  <Input
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Emaili i klientit</Label>
                  <Input
                    type="email"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                  />
                </div>
              </div>
            )}
            <div>
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Pjesëmarrësit
              </Label>
              <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {filteredUsers.map((candidate) => (
                  <label
                    key={candidate.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={participantIds.includes(candidate.id)}
                      onChange={(event) =>
                        setParticipantIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, candidate.id])]
                            : current.filter((id) => id !== candidate.id),
                        )
                      }
                    />
                    {userLabel(candidate)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Shënime / agjenda</Label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            {validation && (
              <div
                className={`rounded-lg border p-3 text-sm ${validation.can_create ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
              >
                <div className="mb-1 font-semibold">
                  {validation.can_create
                    ? "Sloti është valid"
                    : "Takimi nuk mund të krijohet"}
                </div>
                {validation.errors.map((message) => (
                  <div key={message} className="text-red-700">
                    • {message}
                  </div>
                ))}
                {validation.warnings.map((message) => (
                  <div key={message} className="text-amber-700">
                    • {message}
                  </div>
                ))}
                {validation.conflicts.map((conflict) => (
                  <div
                    key={`${conflict.source}-${conflict.starts_at}`}
                    className="mt-1 text-xs"
                  >
                    {conflict.source}: {conflict.title}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void validate()}
                disabled={saving}
              >
                Validimi
              </Button>
              <Button onClick={() => void submit()} disabled={saving}>
                {saving ? "Duke ruajtur…" : "Dërgo për aprovim"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Kërkesat dhe aprovimet
            </CardTitle>
            <CardDescription>
              Duhen dy aprovues të ndryshëm nga krijuesi i kërkesës.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Nuk ka kërkesa në këtë javë.
              </div>
            ) : (
              requests.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(item.starts_at).toLocaleString("sq-AL")}
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Aprovime: <strong>{item.approval_count}/2</strong>
                    {item.approvals.length
                      ? ` — ${item.approvals.map((approval) => approval.user_name).join(", ")}`
                      : ""}
                  </div>
                  {item.last_error && (
                    <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                      {item.last_error}
                    </div>
                  )}
                  {item.rejection_reason && (
                    <div className="mt-2 rounded bg-slate-100 p-2 text-xs text-slate-700">
                      <strong>Arsyeja e refuzimit:</strong>{" "}
                      {item.rejection_reason}
                    </div>
                  )}
                  {item.teams_url && (
                    <a
                      href={item.teams_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700"
                    >
                      Hap Teams <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {canApprove &&
                    item.created_by_user_id !== user?.id &&
                    !["CREATED", "REJECTED", "CANCELED"].includes(
                      item.status,
                    ) && (
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              void requestAction(item.id, "approve")
                            }
                          >
                            <CheckCircle2 className="mr-1 h-4 w-4" />
                            Aprovo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectingRequestId(item.id);
                              setRejectionReason("");
                            }}
                          >
                            Refuzo
                          </Button>
                        </div>
                        {rejectingRequestId === item.id && (
                          <div className="mt-2 space-y-2">
                            <textarea
                              className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                              value={rejectionReason}
                              onChange={(event) =>
                                setRejectionReason(event.target.value)
                              }
                              placeholder="Arsyeja e refuzimit"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRejectingRequestId(null);
                                  setRejectionReason("");
                                }}
                              >
                                Anulo
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void rejectRequest(item.id)}
                              >
                                Konfirmo refuzimin
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  {canApprove && item.status.includes("FAILED") && (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => void requestAction(item.id, "retry")}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {canApprove && (
        <Card>
          <CardHeader>
            <CardTitle>Standardet e takimeve</CardTitle>
            <CardDescription>
              Shto kohëzgjatjen dhe buffer-in. Orari standard është 08:00–17:00.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label>Emri</Label>
                <Input
                  value={standardName}
                  onChange={(event) => setStandardName(event.target.value)}
                  placeholder="Takim klienti"
                />
              </div>
              <div>
                <Label>Lloji</Label>
                <Select
                  value={standardType}
                  onValueChange={(value) =>
                    setStandardType(value as "internal" | "external")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">TAK EXT</SelectItem>
                    <SelectItem value="internal">TAK INT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Minuta</Label>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={standardDuration}
                  onChange={(event) =>
                    setStandardDuration(Number(event.target.value) || 60)
                  }
                />
              </div>
              <div>
                <Label>Buffer</Label>
                <Input
                  type="number"
                  min={0}
                  step={5}
                  value={standardBuffer}
                  onChange={(event) =>
                    setStandardBuffer(Number(event.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {standards
                  .map(
                    (item) =>
                      `${item.name}: ${item.default_duration_minutes} min, buffer ${item.buffer_minutes} min`,
                  )
                  .join(" · ")}
              </div>
              <Button variant="outline" onClick={() => void createStandard()}>
                Shto standard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
