import { Router, RequestHandler } from "express";
import { HeartbeatController } from "../controller/heartbeat.controller";
import { RoomStateService } from "../service/room-state.service";
import { verifyToken } from "../middleware/auth.middleware";


const router = Router();
const roomStateService = new RoomStateService();
const heartbeatController = new HeartbeatController(roomStateService);

router.post("/", verifyToken ,heartbeatController.heartbeat as RequestHandler);

export default router;
