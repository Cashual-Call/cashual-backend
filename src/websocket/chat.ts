import { Server, Socket, Namespace } from "socket.io";
import { redis, subClient } from "../lib/redis";
import { ChatReceiverController } from "../controller/chat/chat-reciever.controller";
import { ChatEvent } from "../config/websocket";
import { verifyToken } from "../middleware/socket.middleware";
import { ChatEmitterController } from "../controller/chat/chat-emitter.controller";
import { FriendsService } from "../service/friend.service";
import { NotificationService } from "../service/notification.service";
import { NotificationType } from "@prisma/client";
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
            setTimeout(
              () => subscribeWithRetry(channel, retryCount + 1),
              Math.pow(2, retryCount) * 1000
            );
          } else {
            console.error(
              `Failed to subscribe to ${channel} after ${retryCount} retries`
            );
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
    console.log(
      "Redis subscription client reconnected, setting up subscriptions again"
    );
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

  // Initialize friends service and notification service
  const friendsService = new FriendsService();
  const notificationService = new NotificationService();

  chatNamespace.on("connection", async (socket: Socket) => {
    const authToken = socket.handshake.auth.token;

    const { roomId, senderId, receiverId, senderUsername = '', receiverUsername = '' } = authToken
      ? verifyToken(authToken)
      : {
          roomId: "general",
          senderId: socket.id, // TODO: chanage,
          receiverId: "global",
          senderUsername: "",
          receiverUsername: "",
        };
    redis.set(`chat:total-users`, io.engine.clientsCount);

    const chatRecieverController = new ChatReceiverController(
      socket,
      roomId,
      senderId,
      receiverId
    );

    chatRecieverController.joinRoom();

    // Join a chat room
    // socket.on(ChatEvent.JOIN, () => chatRecieverController.joinRoom());

    // Leave a chat room
    socket.on(ChatEvent.LEAVE, () => chatRecieverController.leaveRoom());

    // Handle new messages
    socket.on(ChatEvent.MESSAGE, async (data: ChatMessage) =>
      chatRecieverController.chatMessage(data, {
        senderUsername,
        receiverUsername,
        roomId,
        senderId,
        receiverId,
      })
    );

    // Handle disconnection
    socket.on(ChatEvent.DISCONNECT, () => {
      chatRecieverController.disconnect();
      redis.set(`chat:total-users`, io.engine.clientsCount);
    });

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

    // Handle friend request
    socket.on(ChatEvent.FRIEND_REQUEST, async (data: { friendUsername: string }) => {
      try {
        if (!senderUsername) {
          socket.emit(ChatEvent.ERROR, { message: "Unauthorized" });
          return;
        }

        const result = await friendsService.sendFriendRequest(senderUsername, data.friendUsername);
        
        // Emit success back to sender
        socket.emit(ChatEvent.FRIEND_REQUEST_SENT, {
          success: true,
          message: "Friend request sent successfully",
          data: result
        });

        // Send notification to the friend
        await notificationService.sendNotification(data.friendUsername, {
          type: NotificationType.FRIEND_REQUEST,
          title: "New Friend Request",
          message: `${senderUsername} wants to be your friend`,
          data: {
            fromUsername: senderUsername,
            friendRequestId: result.friendshipId,
            action: 'friend_request'
          }
        });

        // Also notify via socket if they're online in the same room
        const roomSockets = await chatNamespace.in(roomId).fetchSockets();
        for (const roomSocket of roomSockets) {
          const roomSocketToken = roomSocket.handshake.auth.token;
          if (roomSocketToken) {
            const { senderUsername: roomSocketUsername } = verifyToken(roomSocketToken);
            if (roomSocketUsername === data.friendUsername) {
              roomSocket.emit(ChatEvent.FRIEND_STATUS_UPDATE, {
                type: 'friend_request_received',
                from: senderUsername,
                message: `${senderUsername} sent you a friend request`,
                notificationData: {
                  fromUsername: senderUsername,
                  friendRequestId: result.friendshipId
                }
              });
              break;
            }
          }
        }
      } catch (error) {
        console.error("Error handling friend request:", error);
        socket.emit(ChatEvent.ERROR, { 
          message: error instanceof Error ? error.message : "Failed to send friend request" 
        });
      }
    });

    // Handle friend removal
    socket.on(ChatEvent.FRIEND_REMOVED, async (data: { friendUsername: string }) => {
      try {
        if (!senderUsername) {
          socket.emit(ChatEvent.ERROR, { message: "Unauthorized" });
          return;
        }

        const result = await friendsService.removeFriend(senderUsername, data.friendUsername);
        
        // Emit success back to sender
        socket.emit(ChatEvent.FRIEND_STATUS_UPDATE, {
          type: 'friend_removed',
          success: true,
          message: result.message
        });

        // Notify the friend if they're online
        const roomSockets = await chatNamespace.in(roomId).fetchSockets();
        for (const roomSocket of roomSockets) {
          const roomSocketToken = roomSocket.handshake.auth.token;
          if (roomSocketToken) {
            const { senderUsername: roomSocketUsername } = verifyToken(roomSocketToken);
            if (roomSocketUsername === data.friendUsername) {
              roomSocket.emit(ChatEvent.FRIEND_STATUS_UPDATE, {
                type: 'friend_removed',
                from: senderUsername,
                message: `${senderUsername} removed you from friends`
              });
              break;
            }
          }
        }
      } catch (error) {
        console.error("Error handling friend removal:", error);
        socket.emit(ChatEvent.ERROR, { 
          message: error instanceof Error ? error.message : "Failed to remove friend" 
        });
      }
    });

    // Handle friend request accept
    socket.on(ChatEvent.FRIEND_REQUEST_ACCEPT, async (data: { friendUsername: string, friendRequestId: string }) => {
      try {
        if (!senderUsername) {
          socket.emit(ChatEvent.ERROR, { message: "Unauthorized" });
          return;
        }

        if (!data.friendRequestId) {
          socket.emit(ChatEvent.ERROR, { message: "Friend request ID is required" });
          return;
        }

        // Accept the friend request (this should update the friendship status)
        const result = await friendsService.acceptFriendRequest(data.friendRequestId);
        
        // Emit success back to accepter
        socket.emit(ChatEvent.FRIEND_STATUS_UPDATE, {
          type: 'friend_request_accepted',
          success: true,
          message: `You are now friends with ${data.friendUsername}`
        });

        // Send notification to the original requester
        await notificationService.sendNotification(data.friendUsername, {
          type: NotificationType.FRIEND_ACCEPTED,
          title: "Friend Request Accepted",
          message: `${senderUsername} accepted your friend request`,
          data: {
            fromUsername: senderUsername,
            action: 'friend_accepted'
          }
        });

      } catch (error) {
        console.error("Error accepting friend request:", error);
        socket.emit(ChatEvent.ERROR, { 
          message: error instanceof Error ? error.message : "Failed to accept friend request" 
        });
      }
    });

    // Handle friend request reject
    socket.on(ChatEvent.FRIEND_REQUEST_REJECT, async (data: { friendUsername: string, friendRequestId: string }) => {
      try {
        if (!senderUsername) {
          socket.emit(ChatEvent.ERROR, { message: "Unauthorized" });
          return;
        }

        if (!data.friendRequestId) {
          socket.emit(ChatEvent.ERROR, { message: "Friend request ID is required" });
          return;
        }

        // Reject the friend request
        const result = await friendsService.rejectFriendRequest(data.friendRequestId);
        
        // Emit success back to rejecter
        socket.emit(ChatEvent.FRIEND_STATUS_UPDATE, {
          type: 'friend_request_rejected',
          success: true,
          message: `Friend request from ${data.friendUsername} rejected`
        });

        // Optionally notify the original requester (usually not done for privacy)
        // await notificationService.sendNotification(data.friendUsername, {
        //   type: NotificationType.FRIEND_REJECTED,
        //   title: "Friend Request",
        //   message: `Your friend request was not accepted`,
        // });

      } catch (error) {
        console.error("Error rejecting friend request:", error);
        socket.emit(ChatEvent.ERROR, { 
          message: error instanceof Error ? error.message : "Failed to reject friend request" 
        });
      }
    });
  });
}
