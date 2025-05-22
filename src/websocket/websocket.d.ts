interface ChatMessage {
  content: string;
}

interface RoomEvent {
  type:
    | "join"
    | "leave"
    | "typing"
    | "stopped_typing"
    | "connected"
    | "disconnected";
  roomId: string;
  clientId: string;
  username: string;
  timestamp: string;
}

interface SearchResult {
  id: string;
  type: "user" | "chat" | "message";
  content: string;
  metadata: Record<string, any>;
}

interface SearchQuery {
  query: string;
  filters?: {
    type?: "user" | "chat" | "message";
    dateRange?: { start: string; end: string };
    tags?: string[];
  };
}

interface UserSearchStatus {
  isSearching: boolean;
  interests: string[];
  lastActive: number;
}