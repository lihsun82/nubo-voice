export type TaskKind = "reminder" | "report" | "research" | "brief";
export type TaskStatus = "active" | "paused" | "completed";
export type ScheduleType = "once" | "hourly" | "daily" | "interval";

export type TaskSchedule = {
  type: ScheduleType;
  runAt?: string;
  hour?: number;
  minute?: number;
  intervalMinutes?: number;
  timezone: "Asia/Taipei";
};

export type TaskSource =
  | { type: "none" }
  | {
      type: "gmail";
      query: string;
      maxResults?: number;
      includeBody?: boolean;
    };

export type TaskDelivery =
  | { type: "inbox" }
  | {
      type: "gmail_draft" | "gmail_send";
      to: string;
      subject?: string;
    };

export type NuboTask = {
  id: string;
  title: string;
  kind: TaskKind;
  instruction: string;
  condition?: string;
  source?: TaskSource;
  delivery?: TaskDelivery;
  schedule: TaskSchedule;
  status: TaskStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskRun = {
  id: string;
  taskId: string;
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  output: string | null;
  error: string | null;
};

export type NuboNotice = {
  id: string;
  taskId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type CreateTaskInput = {
  title: string;
  kind: TaskKind;
  instruction: string;
  condition?: string;
  source?: TaskSource;
  delivery?: TaskDelivery;
  schedule: TaskSchedule;
};
