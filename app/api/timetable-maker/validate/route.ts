import { NextResponse } from "next/server";
import { timetableStore } from "@/lib/timetableStore";
import { isSlotOverlap, type DayOfWeek } from "@/lib/timetableSolver";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, newDay, newStartTime, newEndTime, newRoomId, applyMove = false } = body;

    const activeVersion = timetableStore.getActiveVersion();
    if (!activeVersion) {
      return NextResponse.json({ error: "No active timetable version" }, { status: 400 });
    }

    const sessions = timetableStore.getSessions(activeVersion.id);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const rooms = timetableStore.getRooms();
    const targetRoom = newRoomId ? rooms.find((r) => r.room_id === newRoomId) : rooms.find((r) => r.room_id === targetSession.room_id);

    // Compute numeric hours
    const [sh, sm] = newStartTime.split(":").map(Number);
    const [eh, em] = newEndTime.split(":").map(Number);
    const startHour = sh + (sm || 0) / 60;
    const endHour = eh + (em || 0) / 60;

    const candidateSlot = {
      day: newDay as DayOfWeek,
      startHour,
      endHour,
      duration: endHour - startHour,
      startTimeStr: newStartTime,
      endTimeStr: newEndTime,
    };

    // 1. Check dynamic Break and Buffer Overlaps from config
    const config = timetableStore.getConfig();
    const blockedSlots = config.period_slots
      ? config.period_slots
          .filter((s) => s.is_break || s.is_buffer)
          .map((s) => ({
            name: s.is_buffer ? (s.label ? `Buffer Window (${s.label})` : "Buffer Time") : s.label,
            start: s.start_time,
            end: s.end_time,
          }))
      : config.break_slots || [];

    for (const b of blockedSlots) {
      const [bSh, bSm] = b.start.split(":").map(Number);
      const [bEh, bEm] = b.end.split(":").map(Number);
      const bStart = bSh + (bSm || 0) / 60;
      const bEnd = bEh + (bEm || 0) / 60;

      if (startHour < bEnd && bStart < endHour) {
        return NextResponse.json({
          valid: false,
          reason: `Session cannot overlap with ${b.name} (${b.start}–${b.end})`,
        });
      }
    }

    // 2. Check collision with all other sessions
    for (const s of sessions) {
      if (s.id === sessionId) continue;
      if (s.day_of_week === newDay) {
        const [sSh, sSm] = s.start_time.split(":").map(Number);
        const [sEh, sEm] = s.end_time.split(":").map(Number);
        const otherSlot = {
          day: s.day_of_week,
          startHour: sSh + (sSm || 0) / 60,
          endHour: sEh + (sEm || 0) / 60,
          duration: s.duration_hours,
          startTimeStr: s.start_time,
          endTimeStr: s.end_time,
        };

        if (isSlotOverlap(candidateSlot, otherSlot)) {
          // Teacher double-booking
          if (s.teacher_id === targetSession.teacher_id) {
            return NextResponse.json({
              valid: false,
              reason: `Teacher ${targetSession.teacher_name} is already teaching ${s.course_code} at this time`,
            });
          }

          // Room double-booking
          if (targetRoom && s.room_id === targetRoom.room_id && targetRoom.exclusive_use) {
            return NextResponse.json({
              valid: false,
              reason: `Room ${targetRoom.name} is already occupied by ${s.course_code}`,
            });
          }

          // Batch double-booking
          if (s.batch_id === targetSession.batch_id) {
            return NextResponse.json({
              valid: false,
              reason: `Batch ${targetSession.section_id} already has class ${s.course_code} at this time`,
            });
          }
        }
      }
    }

    // If valid and applyMove is requested, update the session
    if (applyMove) {
      timetableStore.updateSession(activeVersion.id, sessionId, {
        day_of_week: newDay,
        start_time: newStartTime,
        end_time: newEndTime,
        room_id: targetRoom ? targetRoom.room_id : targetSession.room_id,
        room_name: targetRoom ? targetRoom.name : targetSession.room_name,
      });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validation failed" },
      { status: 500 }
    );
  }
}
