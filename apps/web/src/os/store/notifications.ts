import type { OSApi } from "./index";

export interface Notification {
  id: string;
  title: string;
  body?: string;
  icon?: string;
  createdAt: number;
}

export interface NotificationState {
  items: Notification[];
}

export const initialNotifications: NotificationState = { items: [] };

export function createNotificationActions(api: OSApi) {
  // A counter, never items.length: ids must stay unique after a dismiss.
  let counter = 0;
  return {
    /** Adds a notification and returns its id. Call from client effects only. */
    push(n: Omit<Notification, "id" | "createdAt">): string {
      const id = `n${++counter}`;
      api.setState((s) => {
        s.notifications.items.push({ ...n, id, createdAt: Date.now() });
      });
      return id;
    },
    dismiss(id: string): void {
      api.setState((s) => {
        s.notifications.items = s.notifications.items.filter(
          (i) => i.id !== id,
        );
      });
    },
    clear(): void {
      api.setState((s) => {
        s.notifications.items = [];
      });
    },
  };
}
