import { NextResponse } from "next/server";
import { timetableStore } from "@/lib/timetableStore";

export async function GET() {
  try {
    const activeVersion = timetableStore.getActiveVersion();
    const sessions = activeVersion ? timetableStore.getSessions(activeVersion.id) : [];

    return NextResponse.json({
      departments: timetableStore.getDepartments(),
      teachers: timetableStore.getTeachers(),
      teacherAvailability: timetableStore.getTeacherAvailability(),
      rooms: timetableStore.getRooms(),
      batches: timetableStore.getBatches(),
      courses: timetableStore.getCourses(),
      config: timetableStore.getConfig(),
      versions: timetableStore.getVersions(),
      activeVersion,
      sessions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load timetable data" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    switch (action) {
      // Courses
      case "add_course": {
        const item = timetableStore.addCourse(payload);
        return NextResponse.json({ success: true, item });
      }
      case "update_course": {
        const item = timetableStore.updateCourse(payload.id, payload);
        return NextResponse.json({ success: true, item });
      }
      case "delete_course": {
        timetableStore.deleteCourse(payload.id);
        return NextResponse.json({ success: true });
      }

      // Teachers
      case "add_teacher": {
        const item = timetableStore.addTeacher(payload);
        return NextResponse.json({ success: true, item });
      }
      case "update_teacher": {
        const item = timetableStore.updateTeacher(payload.id, payload);
        return NextResponse.json({ success: true, item });
      }
      case "delete_teacher": {
        timetableStore.deleteTeacher(payload.id);
        return NextResponse.json({ success: true });
      }
      case "set_availability": {
        timetableStore.setTeacherAvailability(payload.records);
        return NextResponse.json({ success: true });
      }

      // Rooms
      case "add_room": {
        const item = timetableStore.addRoom(payload);
        return NextResponse.json({ success: true, item });
      }
      case "update_room": {
        const item = timetableStore.updateRoom(payload.id, payload);
        return NextResponse.json({ success: true, item });
      }
      case "delete_room": {
        timetableStore.deleteRoom(payload.id);
        return NextResponse.json({ success: true });
      }

      // Batches
      case "add_batch": {
        const item = timetableStore.addBatch(payload);
        return NextResponse.json({ success: true, item });
      }
      case "update_batch": {
        const item = timetableStore.updateBatch(payload.id, payload);
        return NextResponse.json({ success: true, item });
      }

      // Config
      case "update_config": {
        const item = timetableStore.updateConfig(payload);
        return NextResponse.json({ success: true, item });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Operation failed" },
      { status: 500 }
    );
  }
}
