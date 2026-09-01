-- Per-category email gating: which uiPreferences.notificationPreferences toggle applies to this delivery.
ALTER TABLE "NotificationEmailDelivery" ADD COLUMN "emailPreferenceKey" TEXT;
