"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
const validationFailure = (message: string): Validation => ({
  can_create: false,
  errors: [message],
  warnings: [],
  conflicts: [],
});

const uniqueConflicts = (conflicts: Validation["conflicts"]) =>
  Array.from(
    new Map(
      conflicts.map((conflict) => [
        `${conflict.source}|${conflict.title}|${conflict.starts_at}|${conflict.ends_at}`,
        conflict,
      ]),
    ).values(),
  );

const meetingSchedulerError = async (
  response: Response,
  fallback: string,
) => {
  const raw = await response.text();
  if (!raw) return fallback;
  try {
    const body = JSON.parse(raw) as {
      detail?:
        | string
        | Array<{ msg?: string; loc?: Array<string | number> }>
        | { errors?: string[]; warnings?: string[] };
    };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      const messages = body.detail
        .map((item) => {
          const message = String(item.msg || "").replace(/^Value error,\s*/i, "");
          return message;
        })
        .filter(Boolean);
      if (messages.length) return messages.join(" ");
    }
    if (body.detail && !Array.isArray(body.detail) && body.detail.errors?.length) {
      return body.detail.errors.join(" ");
    }
  } catch {
    // Non-JSON errors are returned below without hiding the server response.
  }
  return raw || fallback;
};

export default function MeetingSchedulerPage() {
  const { apiFetch, user } = useAuth();
  const [weekStart, setWeekStart] = React.useState(() => mondayFor(new Date()));
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [users, setUsers] = React.useState<UserLookup[]>([]);
  const [standards, setStandards] = React.useState<Standard[]>([]);
  const [calendarItems, setCalendarItems] = React.useState<CalendarItem[]>([]);
  const [microsoftEvents, setMicrosoftEvents] = React.useState<
    MicrosoftEvent[]
  >([]);
  const [msConnected, setMsConnected] = React.useState(false);
  const [msCanWrite, setMsCanWrite] = React.useState(false);
  const [msCanManage, setMsCanManage] = React.useState(false);
  const [msAccountEmail, setMsAccountEmail] =
    React.useState("info@primexeu.com");
  const [loading, setLoading] = React.useState(true);
  const [validating, setValidating] = React.useState(false);
  const [validation, setValidation] = React.useState<Validation | null>(null);

  const [departmentId, setDepartmentId] = React.useState(
    user?.department_id || "",
  );
  const [meetingType, setMeetingType] = React.useState<"internal" | "external">(
    "external",
  );
  const [standardId, setStandardId] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(isoDate(new Date()));
  const [selectedTime, setSelectedTime] = React.useState("09:00");
  const [duration, setDuration] = React.useState(60);
  const [participantIds, setParticipantIds] = React.useState<string[]>(
    user?.id ? [user.id] : [],
  );
  const [standardName, setStandardName] = React.useState("");
  const [standardType, setStandardType] = React.useState<
    "internal" | "external"
  >("external");
  const [standardDuration, setStandardDuration] = React.useState(60);
  const [standardBuffer, setStandardBuffer] = React.useState(15);

  const days = React.useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const rangeStart = days[0].toISOString();
  const rangeEnd = addDays(days[4], 1).toISOString();
  const departmentNames = React.useMemo(
    () => new Map(departments.map((department) => [department.id, department.name])),
    [departments],
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
    const calendarRes = await apiFetch(`/meeting-scheduler/calendar?${query}`);
    if (calendarRes.ok) setCalendarItems(await calendarRes.json());
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
      title: meetingType === "external" ? "Kontroll TAK EXT" : "Kontroll TAK INT",
      meeting_type: meetingType,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      platform: meetingType === "external" ? "Teams" : null,
      notes: null,
      department_id: departmentId,
      project_id: null,
      standard_id: standardId || null,
      participant_ids: participantIds,
    };
  }, [
    departmentId,
    duration,
    meetingType,
    participantIds,
    selectedDate,
    selectedTime,
    standardId,
  ]);

  const validate = async () => {
    const missingFields = [
      !payload.department_id ? "departamentin" : "",
      !payload.participant_ids.length ? "të paktën një pjesëmarrës" : "",
    ].filter(Boolean);
    if (missingFields.length) {
      const message = `Plotëso ${missingFields.join(", ")} para validimit.`;
      setValidation(validationFailure(message));
      toast.error("Takimi nuk mund të validohet.", { description: message });
      return null;
    }
    setValidating(true);
    try {
      const response = await apiFetch("/meeting-scheduler/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await meetingSchedulerError(
          response,
          "Validimi dështoi për shkak të një gabimi të panjohur.",
        );
        setValidation(validationFailure(message));
        toast.error("Takimi nuk mund të validohet.", { description: message });
        return null;
      }
      const result = (await response.json()) as Validation;
      setValidation(result);
      if (!result.can_create) {
        toast.error("Ka konflikt në këtë orar.", {
          description:
            result.errors.join(" ") ||
            "Kontrollo konfliktet e shfaqura te rezultati i validimit.",
        });
      } else {
        toast.success("Orari është i lirë për këtë takim.");
      }
      return result;
    } finally {
      setValidating(false);
    }
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

  const canManageStandards =
    user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Meeting Scheduler
          </h1>
          <p className="text-sm text-slate-500">
            Kontrollo nëse një orar është i lirë për TAK INT ose TAK EXT. Kjo
            faqe nuk krijon takim dhe nuk i dërgon ftesë klientit.
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
                Kliko një slot për ta kontrolluar.
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

      <Card id="meeting-request-form">
          <CardHeader>
            <CardTitle>Kontrollo orarin e takimit</CardTitle>
            <CardDescription>
              {selectedDate} në {selectedTime}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
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
                <Label>Departamenti</Label>
                <Select
                  value={departmentId}
                  onValueChange={(value) => {
                    setDepartmentId(value);
                    setValidation(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zgjidh departamentin" />
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
              <div>
                <Label>Standardi</Label>
                <Select
                  value={standardId}
                  onValueChange={(value) => {
                    setStandardId(value);
                    setValidation(null);
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
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setValidation(null);
                  }}
                />
              </div>
              <div>
                <Label>Ora</Label>
                <Input
                  type="time"
                  step={900}
                  value={selectedTime}
                  onChange={(event) => {
                    setSelectedTime(event.target.value);
                    setValidation(null);
                  }}
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
                  onChange={(event) => {
                    setDuration(Number(event.target.value) || 60);
                    setValidation(null);
                  }}
                />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Pjesëmarrësit
              </Label>
              <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {users.map((candidate) => (
                  <label
                    key={candidate.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={participantIds.includes(candidate.id)}
                      onChange={(event) => {
                        setValidation(null);
                        setParticipantIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, candidate.id])]
                            : current.filter((id) => id !== candidate.id),
                        );
                      }}
                    />
                    <span>
                      {userLabel(candidate)}
                      {candidate.department_id && departmentNames.get(candidate.department_id) ? (
                        <span className="ml-1 text-xs text-slate-500">
                          ({departmentNames.get(candidate.department_id)})
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {validation && (
              <div
                className={`rounded-lg border p-3 text-sm ${validation.can_create ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
              >
                <div className="mb-1 font-semibold">
                  {validation.can_create
                    ? "Orari është i lirë"
                    : "Ka konflikt në këtë orar"}
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
                {uniqueConflicts(validation.conflicts).map((conflict, index) => (
                  <div
                    key={`${conflict.source}-${conflict.starts_at}-${conflict.ends_at}-${index}`}
                    className="mt-1 text-xs"
                  >
                    {conflict.source}: {conflict.title}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                onClick={() => void validate()}
                disabled={validating}
              >
                {validating ? "Duke kontrolluar…" : "Kontrollo orarin"}
              </Button>
            </div>
          </CardContent>
        </Card>

      {canManageStandards && (
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
