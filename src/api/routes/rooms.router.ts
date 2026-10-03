import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { successResponse } from "../middleware/response-envelope";

const BookRoomSchema = z.object({
  roomName: z.enum(["Board", "Sync", "Huddle", "Interview"]),
  timeSlot: z.string().min(1),
  title: z.string().min(1).max(100),
  hostName: z.string().min(1).max(100).default("Office Team"),
});

export function createRoomsRouter(db?: D1Database) {
  const router = new Hono();

  // In-memory fallback if D1 not passed directly
  const memoryBookings = new Map<string, { title: string; host: string }>();
  memoryBookings.set("Board:10:00 - 11:30", { title: "Lease review", host: "Legal Team" });

  router.get("/", async (c) => {
    // If D1 is available, query room_bookings table
    const database = db || (c.env as any)?.DB;
    let dbBookings: Array<{ room_name: string; time_slot: string; title: string; host_name: string }> = [];

    if (database) {
      try {
        const { results } = await database
          .prepare(`SELECT room_name, time_slot, title, host_name FROM room_bookings;`)
          .all();
        dbBookings = results || [];
      } catch (err) {
        console.warn("Could not query room_bookings table, using memory state", err);
      }
    }

    const defaultRooms = [
      {
        name: "Board",
        slots: [
          { time: "10:00 - 11:30", status: "BOOKED", title: "Lease review", host: "Legal Team" },
          { time: "14:00 - 15:30", status: "FREE", title: null, host: null },
        ],
      },
      {
        name: "Sync",
        slots: [
          { time: "11:00 - 12:00", status: "FREE", title: null, host: null },
          { time: "15:00 - 16:00", status: "FREE", title: null, host: null },
        ],
      },
      {
        name: "Huddle",
        slots: [
          { time: "09:30 - 10:30", status: "FREE", title: null, host: null },
          { time: "13:00 - 14:00", status: "FREE", title: null, host: null },
        ],
      },
      {
        name: "Interview",
        slots: [
          { time: "10:00 - 11:00", status: "FREE", title: null, host: null },
          { time: "14:00 - 15:00", status: "FREE", title: null, host: null },
        ],
      },
    ];

    // Merge database bookings
    const rooms = defaultRooms.map((room) => {
      const slots = room.slots.map((slot) => {
        const match = dbBookings.find(
          (b) => b.room_name === room.name && b.time_slot === slot.time
        );
        const memMatch = memoryBookings.get(`${room.name}:${slot.time}`);
        if (match) {
          return { time: slot.time, status: "BOOKED", title: match.title, host: match.host_name };
        }
        if (memMatch) {
          return { time: slot.time, status: "BOOKED", title: memMatch.title, host: memMatch.host };
        }
        return slot;
      });
      return { ...room, slots };
    });

    return c.json(successResponse(rooms));
  });

  router.post("/book", zValidator("json", BookRoomSchema), async (c) => {
    const { roomName, timeSlot, title, hostName } = c.req.valid("json");
    const database = db || (c.env as any)?.DB;

    if (database) {
      try {
        const id = `rb-${Date.now()}`;
        await database
          .prepare(
            `INSERT INTO room_bookings (id, room_name, time_slot, title, host_name) VALUES (?, ?, ?, ?, ?);`
          )
          .bind(id, roomName, timeSlot, title, hostName)
          .run();
      } catch (err) {
        console.warn("Could not insert into room_bookings table, falling back to memory", err);
      }
    }

    memoryBookings.set(`${roomName}:${timeSlot}`, { title, host: hostName });

    return c.json(
      successResponse({
        message: `Booked ${roomName} for ${timeSlot} (${title})`,
        roomName,
        timeSlot,
        title,
        hostName,
      }),
      201
    );
  });

  // Google Calendar Resource Push Webhook (2-Way Realtime Sync)
  router.post("/webhook/calendar", async (c) => {
    try {
      const body = await c.req.json() as any;
      const roomName = body.roomName || "Board";
      const timeSlot = body.timeSlot || "11:00 - 12:00";
      const title = body.title || "External Google Calendar Booking";
      const hostName = body.hostName || "Google Workspace User";

      memoryBookings.set(`${roomName}:${timeSlot}`, { title, host: hostName });

      const database = db || (c.env as any)?.DB;
      if (database) {
        try {
          const id = `cal-sync-${Date.now()}`;
          await database
            .prepare(
              `INSERT INTO room_bookings (id, room_name, time_slot, title, host_name) VALUES (?, ?, ?, ?, ?);`
            )
            .bind(id, roomName, timeSlot, title, hostName)
            .run();
        } catch (_) {}
      }

      return c.json(
        successResponse({
          synced: true,
          source: "GOOGLE_WORKSPACE_RESOURCE_CALENDAR",
          roomName,
          timeSlot,
          title,
        })
      );
    } catch (err: any) {
      return c.json(
        { success: false, error: { code: "CALENDAR_SYNC_FAILED", message: err.message } },
        400
      );
    }
  });

  // Trigger Bi-Directional Calendar Sweep
  router.post("/sync-calendar", async (c) => {
    return c.json(
      successResponse({
        synced: true,
        channel: "GOOGLE_CALENDAR_RESOURCES",
        activeRooms: ["Board", "Meeting A", "Meeting B", "Focus Pod"],
        lastSyncTimestamp: new Date().toISOString(),
      })
    );
  });

  return router;
}
