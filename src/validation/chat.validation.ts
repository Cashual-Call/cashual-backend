import { z } from "zod";

export const messageSchema = z.object({
  content: z.string().min(1),
  roomId: z.string(),
  senderId: z.string(),
  receiverId: z.string(),
  username: z.string(),
  avatarUrl: z.string().optional(),
  timestamp: z.string(),
  type: z.enum(["text", "image", "gif", "audio", "video", "file"]),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  roomId: z.string(),
  timestamp: z.string().transform((str) => new Date(str)),
  senderId: z.string(),
  type: z.enum(["text", "image", "gif", "audio", "video", "file"]),
});

export const userJoinedSchema = z.object({
  roomId: z.string(),
  timestamp: z.string().transform((str) => new Date(str)),
  senderId: z.string(),
});

export type Message = z.infer<typeof messageSchema>;
export type sendMessageSchema = z.infer<typeof sendMessageSchema>;
export type userJoinedSchema = z.infer<typeof userJoinedSchema>;
