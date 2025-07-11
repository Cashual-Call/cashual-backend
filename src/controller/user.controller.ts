import { Request, Response } from "express";
import { UserService } from "../service/user.service";
import { redis } from "../lib/redis";
import { getUserId, verifyUserId } from "../utils/user-id";

export class UserController {
  private userService: UserService;
  private readonly CACHE_TTL = 3600;

  constructor() {
    this.userService = new UserService();

    this.createUser = this.createUser.bind(this);
    this.getUserById = this.getUserById.bind(this);
    this.getAllUsers = this.getAllUsers.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.getPoints = this.getPoints.bind(this);
    this.getUserPointsByDate = this.getUserPointsByDate.bind(this);
  }

  createUser = async (req: Request, res: Response) => {
    try {
      const {
        username,
        publicKey,
        gender,
        ipAddress,
        avatarUrl,
        walletAddress,
      } = req.body;
      const user = await this.userService.createUser({
        username,
        publicKey,
        gender,
        ipAddress,
        avatarUrl,
        walletAddress,
      });
      
      // Invalidate users list cache
      await redis.del('users:all');
      
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Username or public key already exists") {
          res.status(400).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Failed to create user" });
        }
      } else {
        res.status(500).json({ error: "Failed to create user" });
      }
    }
  };

  getUserById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // Try to get from cache first
      const cachedUser = await redis.get(`user:${id}`);
      if (cachedUser) {
        return res.json(JSON.parse(cachedUser));
      }

      const user = await this.userService.getUserById(id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Cache the user data
      await redis.setex(`user:${id}`, this.CACHE_TTL, JSON.stringify(user));

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  };

  getAllUsers = async (req: Request, res: Response) => {
    try {
      // Try to get from cache first
      const cachedUsers = await redis.get('users:all');
      if (cachedUsers) {
        return res.json(JSON.parse(cachedUsers));
      }

      const users = await this.userService.getAllUsers();
      
      // Cache the users list
      await redis.setex('users:all', this.CACHE_TTL, JSON.stringify(users));
      
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  };

  updateUser = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { username, publicKey, gender, avatarUrl, isPro, proEnd } = req.body;

      const user = await this.userService.updateUser(id, {
        username,
        publicKey,
        gender,
        avatarUrl,
        isPro,
        proEnd: proEnd ? new Date(proEnd) : undefined,
      });

      // Invalidate caches
      await Promise.all([
        redis.del(`user:${id}`),
        redis.del('users:all')
      ]);

      res.json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Username or public key already exists") {
          res.status(400).json({ error: error.message });
        } else if (error.message === "User not found") {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Failed to update user" });
        }
      } else {
        res.status(500).json({ error: "Failed to update user" });
      }
    }
  };

  deleteUser = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await this.userService.deleteUser(id);
      
      // Invalidate caches
      await Promise.all([
        redis.del(`user:${id}`),
        redis.del('users:all')
      ]);
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  };

  toggleBanUser = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isBanned } = req.body;

      const user = await this.userService.toggleBanUser(id, Boolean(isBanned));
      
      // Invalidate caches
      await Promise.all([
        redis.del(`user:${id}`),
        redis.del('users:all')
      ]);
      
      res.json(user);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "User not found") {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Failed to update user ban status" });
        }
      } else {
        res.status(500).json({ error: "Failed to update user ban status" });
      }
    }
  };

  getAvailableAvatars = async (req: Request, res: Response) => {
    try {
      // Try to get from cache first
      const cachedAvatars = await redis.get('avatars:all');
      if (cachedAvatars) {
        return res.json(JSON.parse(cachedAvatars));
      }

      const avatars = this.userService.getAvailableAvatars();
      
      // Cache the avatars list
      await redis.setex('avatars:all', this.CACHE_TTL, JSON.stringify(avatars));
      
      res.json(avatars);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch avatars" });
    }
  };

  checkUsernameAvailability = async (req: Request, res: Response) => {
    try {
      const { username } = req.query;

      if (!username || typeof username !== "string") {
        return res.status(400).json({ error: "Username is required" });
      }

      // Try to get from cache first
      const cachedResult = await redis.get(`username:${username}`);
      if (cachedResult) {
        return res.json({ available: JSON.parse(cachedResult) });
      }

      const available = await this.userService.checkUsernameAvailability(username);
      
      // Cache the result with a shorter TTL since this is more time-sensitive
      await redis.setex(`username:${username}`, 300, JSON.stringify(available));
      
      res.json({ available });
    } catch (error) {
      res.status(500).json({ error: "Failed to check username availability" });
    }
  };

  getUserId = async (req: Request, res: Response) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = getUserId(ipAddress);
    console.log(ipAddress);
    res.json({ userId, ipAddress });
  }

  verifyUserId = async (req: Request, res: Response) => {
    const { userId } = req.body;
    const isValid = verifyUserId(userId);
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    res.json({ isValid, ipAddress });
  }

  getPoints = async (req: Request, res: Response) => {
    const publicKey = req.user?.publicKey || "";
    const { startDate, endDate } = req.query;
    const points = await this.userService.getPoints(publicKey, new Date(startDate as string), new Date(endDate as string));
    res.json({ points });
  }

  getUserPointsByDate = async (req: Request, res: Response) => {
    const publicKey = req.user?.publicKey || "";
    const points = await this.userService.getUserPointsByDate(publicKey);
    res.json({ points });
  }

  getRankings = async (_: Request, res: Response) => {
    const data = await this.userService.getRankings();
    res.json({ data });
  } 
}
