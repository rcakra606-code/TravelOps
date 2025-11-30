# Email Notification System - Quick Start

## What's New? 📧

Your TravelOps system now automatically sends departure reminders to tour passengers!

### Reminder Schedule:
- ✅ 7 days before departure
- ✅ 3 days before departure  
- ✅ 2 days before departure
- ✅ 1 day before departure
- ✅ Day of departure

### How It Works:
1. System runs automatically every day at 9:00 AM
2. Checks all upcoming tours with email addresses
3. Sends beautiful HTML reminder emails
4. Tracks sent reminders to avoid duplicates

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Install New Dependencies
```bash
npm install
```

### Step 2: Configure Email Settings

Open `.env` file and add:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

**For Gmail App Password:**
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" → Generate
3. Copy the 16-character password
4. Paste it as `SMTP_PASSWORD`

### Step 3: Restart Server
```bash
npm start
```

### Step 4: Test It!

Run this command (replace TOKEN with your admin token):

```bash
curl -X POST http://localhost:3000/api/email/test \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com"}'
```

You should receive a test email! 🎉

---

## 📋 Admin Features

### Test Email Service
**Endpoint:** `POST /api/email/test`
- Send a test email to verify configuration
- Admin only

### Trigger Reminders Manually  
**Endpoint:** `POST /api/email/trigger-reminders`
- Manually run the reminder check
- Great for testing
- Admin only

### View Statistics
**Endpoint:** `GET /api/email/reminder-stats`
- See how many reminders were sent
- Check reminder history
- Admin and Semi-Admin can access

---

## 📝 Important Notes

1. **Tours need email addresses** - Make sure tour records have valid email addresses in the database

2. **Status matters** - Tours with status "tidak jalan" won't receive reminders

3. **No duplicates** - Each reminder is sent only once per tour per interval

4. **Email in tour form** - The email field is already in your tour CRUD form

5. **Automatic tracking** - A new table `email_reminders` is created automatically

---

## 🎨 Email Template Preview

Each email includes:
- 📅 Countdown to departure
- 🎫 Full tour details (code, booking, date, passengers)
- ✅ Pre-departure checklist (for last 3 days)
- 👤 Staff contact information
- 🌍 Professional TravelOps branding
- 📱 Mobile-responsive design

---

## 🔧 Customization Options

Want to change something? Edit these files:

- **Reminder intervals:** `notificationScheduler.js` → `REMINDER_DAYS`
- **Schedule time:** `notificationScheduler.js` → `cron.schedule()`
- **Email template:** `emailService.js` → `getDepartureEmailTemplate()`

---

## ❓ Troubleshooting

### Emails not sending?
1. Check server logs for errors
2. Verify SMTP credentials in `.env`
3. Test with `/api/email/test` endpoint

### Need more help?
Read the full documentation: `EMAIL_NOTIFICATIONS.md`

---

**That's it!** Your email notification system is ready to go! 🚀

The system will automatically start sending reminders once you have:
- ✅ Configured SMTP settings
- ✅ Restarted the server
- ✅ Tours with email addresses and future departure dates
