import type {
  GmailIntegrationStatus,
  GithubIntegrationStatus,
  GoogleCalendarIntegrationStatus,
  GoogleDriveIntegrationStatus,
  LinearIntegrationStatus,
  SlackIntegrationStatus,
} from "@/features/integrations/queries";

export type IntegrationId =
  | "gmail"
  | "github"
  | "googleCalendar"
  | "googleDrive"
  | "slack"
  | "linear";

export type IntegrationStatus =
  | GmailIntegrationStatus
  | GithubIntegrationStatus
  | GoogleCalendarIntegrationStatus
  | GoogleDriveIntegrationStatus
  | LinearIntegrationStatus
  | SlackIntegrationStatus;

export type IntegrationSummary = {
  about: string;
  category: "AI enterprise search";
  connected: boolean | undefined;
  connectDisabled: boolean;
  connectLabel: string;
  detail: string;
  id: IntegrationId;
  icon: string;
  isBusy: boolean;
  name: string;
  onConnect: () => void;
  onManage: () => void;
  status?: IntegrationStatus | null;
};
