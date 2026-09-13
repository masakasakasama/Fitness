package com.masakasakasama.reps;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;

public class RestAlarmReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "reps_rest";
    private static final int ALARM_REQUEST_CODE = 4100;
    private static final int NOTIFICATION_ID = 4100;

    @Override
    public void onReceive(Context context, Intent intent) {
        ensureNotificationChannel(context);

        if (MainActivity.isInForeground()) {
            return;
        }

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                ALARM_REQUEST_CODE,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        android.app.Notification.Builder builder =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? new android.app.Notification.Builder(context, CHANNEL_ID)
                        : new android.app.Notification.Builder(context);

        builder
                .setSmallIcon(R.drawable.ic_stat_reps)
                .setContentTitle("REPS")
                .setContentText("レスト終了。次のセットへ")
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setPriority(android.app.Notification.PRIORITY_HIGH)
                .setCategory(android.app.Notification.CATEGORY_ALARM);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setDefaults(
                    android.app.Notification.DEFAULT_SOUND
                            | android.app.Notification.DEFAULT_VIBRATE
            );
        }

        nm.notify(NOTIFICATION_ID, builder.build());
    }

    public static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "レストタイマー",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("セット間レスト終了を通知");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 250, 120, 350});
        channel.enableLights(true);
        channel.setLightColor(Color.YELLOW);
        channel.setSound(
                Settings.System.DEFAULT_NOTIFICATION_URI,
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build()
        );
        nm.createNotificationChannel(channel);
    }

    public static void schedule(Context context, int seconds) {
        cancel(context);
        ensureNotificationChannel(context);

        int safeSeconds = Math.max(1, seconds);
        long triggerAt = SystemClock.elapsedRealtime() + safeSeconds * 1000L;

        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        Intent intent = new Intent(context, RestAlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAt,
                        pendingIntent
                );
            } else {
                alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAt,
                        pendingIntent
                );
            }
        } catch (SecurityException ignored) {
            alarmManager.setAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAt,
                    pendingIntent
            );
        }
    }

    public static void cancel(Context context) {
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        Intent intent = new Intent(context, RestAlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );

        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(NOTIFICATION_ID);
    }
}
