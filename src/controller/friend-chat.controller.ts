import { FriendChatService } from "../service/friend-chat.service";
import { FriendsService } from "../service/friend.service";
import { Request, Response } from "express";
import { NotificationService } from "../service/notification.service";
import { NotificationType } from "@prisma/client";

export class FriendChatController {
  private friendChatService: FriendChatService;
  private friendsService: FriendsService;
  private notificationService: NotificationService;

  constructor(searchType: "chat" | "call") {
    this.friendChatService = new FriendChatService(searchType);
    this.friendsService = new FriendsService();
    this.notificationService = new NotificationService();
  }

  /*
   * at first create a room for the two users
   * then create a token for the two users
   * then return the token to the frontend
   * send a notification to the other user
   */
  startChat = async (req: Request, res: Response) => {
    // Friend User Name
    const { friend } = req.params;
    const userId = req.user?.username as string;


    const friendData = await this.friendsService.areFriends(userId, friend, true);
    if (!friendData.areFriends || !friendData.user || !friendData.friend) {
      return res
        .status(400)
        .json({ message: "Not a friend or user not found" });
    }

    const { token1, token2 } = await this.friendChatService.startChat(
      friendData.user,
      friendData.friend
    );

    // Only send notification if friend has a username (required for notification system)
    if (friendData.friend.username) {
      await this.notificationService.sendNotification(
        friendData.friend.username,
        {
          type: NotificationType.NEW_MESSAGE,
          title: "Started Chat with " + friendData.user.displayUsername,
          message: "You have started a chat with " + friendData.user.displayUsername,
          data: {
            token: token2,
            friend: friendData.user.displayUsername,
          },
        }
      );
    }

    res.status(200).json({ message: "Chat started", data: { token: token1 } });
  };
}
