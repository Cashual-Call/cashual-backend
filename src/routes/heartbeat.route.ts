import { Router } from "express";
import { HeartbeatController } from "../controller/heartbeat.controller";
import { RoomStateService } from "../service/room-state.service";

const router = Router();
const roomStateService = new RoomStateService();
const heartbeatController = new HeartbeatController(roomStateService);

router.post("/", heartbeatController.heartbeat);

export default router;