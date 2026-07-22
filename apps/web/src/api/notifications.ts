import { api } from './client';

export interface Notification {
  id: string;
  tenderId: string | null;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export function fetchNotifications(): Promise<NotificationsResponse> {
  return api('/notifications');
}

export function markNotificationRead(id: string): Promise<{ notification: Notification }> {
  return api(`/notifications/${id}/read`, { method: 'POST' });
}
