export enum ChatEvent {
  JOIN = "joined",
  LEAVE = "left",
  MESSAGE = "message",
  MESSAGE_SENT = "message_sent",
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  USER_JOINED = "user_joined",
  USER_LEFT = "user_left",
  USER_TYPING = "user_typing",
  USER_STOPPED_TYPING = "user_stopped_typing",
  USER_DISCONNECTED = "user_disconnected",
  USER_CONNECTED = "user_connected",
  ERROR = "error",
  RECONNECT = "reconnect",
}

export enum SearchEvent {
  START_SEARCH = "start_search",
  STOP_SEARCH = "stop_search",
  SEARCH = "search",
  MATCH_FOUND = "match_found",
  SEARCHING = "searching",
  ERROR = "error",
}