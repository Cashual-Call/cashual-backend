import { Server, Socket, Namespace } from "socket.io";
import { subClient } from "../lib/redis";
import { ChatReceiverController } from "../controller/chat/chat-reciever.controller";
import { ChatEvent } from "../config/websocket";
import { verifyToken } from "../middleware/socket.middleware";
import { ChatEmitterController } from "../controller/chat/chat-emitter.controller";
/**
 * Sets up chat handlers for a Socket.IO server with Redis adapter for horizontal scaling
 * @param io The Socket.IO server instance
 */
export function setupChatHandlers(io: Server) {
  // Setup Redis subscription handlers - need to handle reconnection scenarios
  const setupSubscriptions = () => {
    const subscribeWithRetry = (channel: string, retryCount = 0) => {
      subClient.subscribe(channel, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${channel}:`, err);
          if (retryCount < 3) {
            // Retry subscription after delay with exponential backoff
            setTimeout(() => subscribeWithRetry(channel, retryCount + 1), Math.pow(2, retryCount) * 1000);
          } else {
            console.error(`Failed to subscribe to ${channel} after ${retryCount} retries`);
          }
          return;
        }
        console.log(`Subscribed to ${channel}`);
      });
    };

    // Subscribe to Redis channels
    subscribeWithRetry("chat:messages");
    subscribeWithRetry("chat:rooms");
  };

  setupSubscriptions();

  subClient.on("reconnect", () => {
    console.log("Redis subscription client reconnected, setting up subscriptions again");
    setupSubscriptions();
  });

  subClient.on("error", (error) => {
    console.error("Redis subscription client error:", error);
    // Attempt to reconnect after delay
    setTimeout(setupSubscriptions, 5000);
  });

  // Set up the chat namespace
  const chatNamespace = io.of("/chat");

  const chatEmitterController = new ChatEmitterController(chatNamespace);
  chatEmitterController.initializeSubscriptions();

  chatNamespace.on("connection", async (socket: Socket) => {
    console.log("Chat client connected:", socket.id);
    const authToken = socket.handshake.auth.token;
    const { roomId, senderId, receiverId } = verifyToken(authToken);

    const chatRecieverController = new ChatReceiverController(
      socket,
      roomId,
      senderId,
      receiverId
    );

    chatRecieverController.joinRoom()

    // Join a chat room
    // socket.on(ChatEvent.JOIN, () => chatRecieverController.joinRoom());

    // Leave a chat room
    socket.on(ChatEvent.LEAVE, () => chatRecieverController.leaveRoom());

    // Handle new messages
    socket.on(ChatEvent.MESSAGE, async (data: ChatMessage) =>
      chatRecieverController.chatMessage(data)
    );

    // Handle disconnection
    socket.on(ChatEvent.DISCONNECT, () => chatRecieverController.disconnect());

    // Handle user typing
    socket.on(ChatEvent.USER_TYPING, () => chatRecieverController.userTyping());

    // Handle user stopped typing
    socket.on(ChatEvent.USER_STOPPED_TYPING, () =>
      chatRecieverController.userStoppedTyping()
    );

    // Handle user disconnected
    socket.on(ChatEvent.USER_DISCONNECTED, () =>
      chatRecieverController.userDisconnected()
    );

    // Handle user connected
    socket.on(ChatEvent.USER_CONNECTED, () =>
      chatRecieverController.userConnected()
    );
  });
}
