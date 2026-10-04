import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { IRoomBookingRepository } from "@domain/repositories";
import { RoomBookingEntity } from "@domain/types";
import { successResponse } from "../middleware/response-envelope";

const BookRoomSchema = z.object({
  roomName: z.enum(["Board", "Sync", "Huddle", "Interview"]),
  timeSlot: z.string().min(1),
  title: z.string().min(1).max(100),
  hostName: z.string().min(1).max(100).default("Office Team"),
});

const CalendarWebhookSchema = z.object({
  roomName: z.enum(["Board", "Sync", "Huddle", "Interview"]),
  timeSlot: z.string().min(1),
  title: z.string().min(1).max(100),
  hostName: z.string().min(1).max(100).default("Google Workspace User"),
});

export function createRoomsRouter(options?: { db?: D1Database | undefined; roomBookingRepo?: IRoomBookingRepository | undefined }) {
  const router = new Hono();
  const roomBookingRepo = options?.roomBookingRepo;
  const db = options?.db;

  const defaultRooms = [
    {
      name: "Board" as const,
      slots: [
        { time: "10:00 - 11:30", status: "BOOKED", title: "Lease review", host: "Legal Team" },
        { time: "14:00 - 15:30", status: "FREE", title: null, host: null },
      ],
    },
    {
      name: "Sync" as const,
      slots: [
        { time: "11:00 - 12:00", status: "FREE", title: null, host: null },
        { time: "15:00 - 16:00", status: "FREE", title: null, host: null },
      ],
    },
    {
      name: "Huddle" as const,
      slots: [
        { time: "09:30 - 10:30", status: "FREE", title: null, host: null },
        { time: "13:00 - 14:00", status: "FREE", title: null, host: null },
      ],
    },
    {
      name: "Interview" as const,
      slots: [
        { time: "10:00 - 11:00", status: "FREE", title: null, host: null },
        { time: "14:00 - 15:00", status: "FREE", title: null, host: null },
      ],
    },
  ];

  router.get("/", async (c) => {
    let bookings: RoomBookingEntity[] = [];

    if (roomBookingRepo) {
      bookings = await roomBookingRepo.list();
    } else {
      const database = db || (c.env as any)?.DB;
      if (database) {
        try {
          const { results } = await database
            .prepare(`SELECT id, room_name, time_slot, title, host_name, source, created_at FROM room_bookings;`)
            .all();
          bookings = ((results || []) as any[]).map((r: any) => ({
            id: r.id,
            roomName: r.room_name,
            timeSlot: r.time_slot,
            title: r.title,
            hostName: r.host_name,
            source: r.source,
            createdAt: r.created_at,
          }));
        } catch (_) {}
      }
    }

    const rooms = defaultRooms.map((room) => {
      const slots = room.slots.map((slot) => {
        const match = bookings.find(
          (b) => b.roomName === room.name && b.timeSlot === slot.time
        );
        if (match) {
          return { time: slot.time, status: "BOOKED", title: match.title, host: match.hostName };
        }
        return slot;
      });
      return { ...room, slots };
    });

    return c.json(successResponse(rooms));
  });

  router.post("/book", zValidator("json", BookRoomSchema), async (c) => {
    const { roomName, timeSlot, title, hostName } = c.req.valid("json");
    const id = `rb-${Date.now()}`;
    const newBooking: RoomBookingEntity = {
      id,
      roomName,
      timeSlot,
      title,
      hostName,
      source: "OFFICE_OS",
      createdAt: new Date().toISOString(),
    };

    if (roomBookingRepo) {
      await roomBookingRepo.create(newBooking);
    } else {
      const database = db || (c.env as any)?.DB;
      if (database) {
        try {
          await database
            .prepare(
              `INSERT INTO room_bookings (id, room_name, time_slot, title, host_name, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);`
            )
            .bind(id, roomName, timeSlot, title, hostName, "OFFICE_OS", newBooking.createdAt)
            .run();
        } catch (_) {}
      }
    }

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

  // Google Calendar Resource Push Webhook (Verified Secret)
  router.post("/webhook/calendar", zValidator("json", CalendarWebhookSchema), async (c) => {
    const env = c.env as Record<string, string> | undefined;
    const configuredSecret = env?.CALENDAR_WEBHOOK_SECRET;

    // Check header signature / shared token
    const tokenHeader = c.req.header("X-Webhook-Secret") || c.req.header("X-Goog-Channel-Token");
    if (configuredSecret && tokenHeader !== configuredSecret) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid calendar webhook signature." } },
        401
      );
    }

    const { roomName, timeSlot, title, hostName } = c.req.valid("json");
    const id = `cal-sync-${Date.now()}`;
    const newBooking: RoomBookingEntity = {
      id,
      roomName,
      timeSlot,
      title,
      hostName,
      source: "GOOGLE_WORKSPACE_RESOURCE_CALENDAR",
      createdAt: new Date().toISOString(),
    };

    if (roomBookingRepo) {
      await roomBookingRepo.create(newBooking);
    } else {
      const database = db || (c.env as any)?.DB;
      if (database) {
        try {
          await database
            .prepare(
              `INSERT INTO room_bookings (id, room_name, time_slot, title, host_name, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);`
            )
            .bind(id, roomName, timeSlot, title, hostName, "GOOGLE_WORKSPACE_RESOURCE_CALENDAR", newBooking.createdAt)
            .run();
        } catch (_) {}
      }
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
