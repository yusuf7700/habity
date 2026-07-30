const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

const TZ = "Asia/Tashkent";

// ---------- Sana yordamchilari (Asia/Tashkent, UTC+5, DST yo'q) ----------
function todayKeyInTashkent(offsetDays = 0) {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000 - offsetDays * 86400000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastNDateKeys(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(todayKeyInTashkent(i));
  return arr;
}

// ---------- FCM yuborish + noto'g'ri tokenlarni tozalash ----------
async function sendToUser(userId, tokens, notification, data) {
  if (!tokens || tokens.length === 0) return;
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification,
    data: data || {},
    webpush: { fcmOptions: { link: "/" } }
  });

  const deadTokens = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        deadTokens.push(tokens[i]);
      } else {
        logger.warn(`FCM send error for ${userId}:`, code);
      }
    }
  });

  if (deadTokens.length > 0) {
    await db.doc(`users/${userId}`).update({
      fcmTokens: FieldValue.arrayRemove(...deadTokens)
    }).catch(() => {});
  }
}

async function getHabitsFor(userId) {
  const snap = await db.collection(`users/${userId}/habits`).get();
  return snap.docs.map((d) => d.data());
}

// =====================================================
// 1) KUNLIK ESLATMA — har kuni 20:00 (Tashkent), agar bugun
//    hech qanday odat belgilanmagan bo'lsa
// =====================================================
exports.dailyReminder = onSchedule(
  { schedule: "0 20 * * *", timeZone: TZ, region: "us-central1" },
  async () => {
    const today = todayKeyInTashkent(0);
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      if (!u.notifPrefs || !u.notifPrefs.daily) continue;
      if (!u.fcmTokens || u.fcmTokens.length === 0) continue;

      const habits = await getHabitsFor(userDoc.id);
      if (habits.length === 0) continue;

      const markedToday = habits.some((h) => h.logs && h.logs[today]);
      if (markedToday) continue;

      await sendToUser(
        userDoc.id,
        u.fcmTokens,
        {
          title: "HabitY — kunlik eslatma",
          body: "Bugungi odatlaringizni hali belgilamadingiz. Bir daqiqa ajrating!"
        },
        { type: "daily", url: "/" }
      );
    }
  }
);

// =====================================================
// 2) STREAK OGOHLANTIRISHI — har kuni 22:30 (Tashkent),
//    agar faol streak bor-u bugun hali belgilanmagan bo'lsa
// =====================================================
exports.streakWarning = onSchedule(
  { schedule: "30 22 * * *", timeZone: TZ, region: "us-central1" },
  async () => {
    const today = todayKeyInTashkent(0);
    const yesterday = todayKeyInTashkent(1);
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      if (!u.notifPrefs || !u.notifPrefs.streak) continue;
      if (!u.fcmTokens || u.fcmTokens.length === 0) continue;

      const habits = await getHabitsFor(userDoc.id);
      const atRisk = habits.filter(
        (h) => h.logs && h.logs[yesterday] === "green" && h.logs[today] !== "green"
      );
      if (atRisk.length === 0) continue;

      const body =
        atRisk.length === 1
          ? `"${atRisk[0].name}" streak'ingiz uzilishiga oz qoldi — hali vaqt bor!`
          : `${atRisk.length} ta odatingiz streak'i bugun uzilishi mumkin — belgilashni unutmang!`;

      await sendToUser(
        userDoc.id,
        u.fcmTokens,
        { title: "HabitY — streak ogohlantirishi", body },
        { type: "streak", url: "/" }
      );
    }
  }
);

// =====================================================
// 3) HAFTALIK HISOBOT — har yakshanba 21:00 (Tashkent)
// =====================================================
exports.weeklyReport = onSchedule(
  { schedule: "0 21 * * 0", timeZone: TZ, region: "us-central1" },
  async () => {
    const weekKeys = lastNDateKeys(7);
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      if (!u.notifPrefs || !u.notifPrefs.weekly) continue;
      if (!u.fcmTokens || u.fcmTokens.length === 0) continue;

      const habits = await getHabitsFor(userDoc.id);
      if (habits.length === 0) continue;

      let done = 0;
      const possible = habits.length * weekKeys.length;
      habits.forEach((h) => {
        weekKeys.forEach((k) => {
          if (h.logs && h.logs[k] === "green") done++;
        });
      });
      const pct = possible > 0 ? Math.round((done / possible) * 100) : 0;

      await sendToUser(
        userDoc.id,
        u.fcmTokens,
        {
          title: "HabitY — haftalik hisobot",
          body: `Bu hafta odatlaringizni ${pct}% bajardingiz (${done}/${possible}). Davom eting!`
        },
        { type: "weekly", url: "/" }
      );
    }
  }
);
