export type CollaborationUser = {
  avatar?: string | null;
  clientId: number;
  color: string;
  id: string;
  name: string;
};

export type CollaborationStatus = "local" | "connecting" | "connected" | "disconnected" | "blocked";
