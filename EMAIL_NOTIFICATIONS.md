# Email Notification System - Setup Guide

## Overview
The TravelOps email notification system automatically sends departure reminders to staff users (the logged-in user who created/manages the tour) at the following intervals:
- **7 days** before departure
- **3 days** before departure  
- **2 days** before departure
- **1 day** before departure (tomorrow)
- **0 days** (departure day)

## Features
✅ Automated daily reminders at 9:00 AM  
✅ Beautiful HTML email templates  
✅ Tracks sent reminders to avoid duplicates  
✅ Admin dashboard for testing and monitoring  
✅ Manual trigger option for testing  
✅ Works with Gmail, Outlook, Yahoo, and custom SMTP servers  

---

## 📧 Email Setup Instructions

### Option 1: Gmail (Recommended for Small Teams)

1. **Enable 2-Step Verification**
   - Go to: https://myaccount.google.com/security
   - Click "2-Step Verification" and follow the setup

2. **Create App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Click "Generate"
   - Copy the 16-character password

3. **Update .env file**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-16-char-app-password
   ```

### Option 2: Outlook/Hotmail

1. **Update .env file**
   ```env
   SMTP_HOST=smtp-mail.outlook.com
   SMTP_PORT=587
   SMTP_USER=your-email@outlook.com
   SMTP_PASSWORD=your-regular-password
   ```

2. **Enable SMTP** (if needed)
   - Go to Outlook settings
   - Enable "Let devices and apps use POP"

### Option 3: Yahoo Mail

1. **Generate App Password**
   - Go to: https://login.yahoo.com/account/security
   - Generate app password for "Mail"

2. **Update .env file**
   ```env
   SMTP_HOST=smtp.mail.yahoo.com
   SMTP_PORT=587
   SMTP_USER=your-email@yahoo.com
   SMTP_PASSWORD=your-app-password
   ```

### Option 4: Custom SMTP Server

```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
```

---

## 🚀 Installation

1. **Install Dependencies**
   ```bash
   npm install nodemailer node-cron
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Update email settings as shown above

3. **Restart Server**
   ```bash
   npm start
   ```

4. **Verify Email Service**
   - Check server logs for: "Email service is ready to send messages"
   - Check for: "Departure reminder scheduler initialized"

---

## 🧪 Testing

### Test Email Connection

**Endpoint:** `POST /api/email/test`  
**Auth:** Admin only

```bash
curl -X POST http://localhost:3000/api/email/test \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Test email sent successfully"
}
```

### Manual Trigger Reminders

**Endpoint:** `POST /api/email/trigger-reminders`  
**Auth:** Admin only

```bash
curl -X POST http://localhost:3000/api/email/trigger-reminders \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "remindersSent": 5,
  "errors": 0,
  "details": {
    "sent": [
      {"tour": "TRV-001", "days": 7},
      {"tour": "TRV-002", "days": 3}
    ],
    "errors": []
  }
}
```

### View Reminder Statistics

**Endpoint:** `GET /api/email/reminder-stats`  
**Auth:** Admin or Semi-Admin

```bash
curl http://localhost:3000/api/email/reminder-stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "stats": [
    {
      "days_until_departure": 7,
      "count": 12,
      "sent_date": "2025-11-30"
    },
    {
      "days_until_departure": 3,
      "count": 8,
      "sent_date": "2025-11-29"
    }
  ]
}
```

---

## 📅 Automated Schedule

The system automatically checks for upcoming tours and sends reminders:

- **Time:** Daily at 9:00 AM (server time)
- **Process:**
  1. Fetches all upcoming tours with valid email addresses
  2. Calculates days until departure
  3. Sends reminders for tours matching intervals (7, 3, 2, 1, 0 days)
  4. Records sent reminders to prevent duplicates
  5. Logs results for monitoring

---

## 📊 Database Schema

### email_reminders Table

Automatically created on first run:

```sql
CREATE TABLE email_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tour_id INTEGER NOT NULL,
  days_until_departure INTEGER NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tour_id, days_until_departure)
);
```

This ensures each reminder is sent only once per interval.

---

## 📝 Email Template Features

The automated emails include:

- **Dynamic countdown** with urgency colors
- **Full tour details** (code, booking, date, passengers)
- **Pre-departure checklist** (for 0-3 days before)
- **Staff contact information** (if available)
- **Responsive design** (mobile-friendly)
- **Professional branding** with TravelOps logo

---

## 🔧 Customization

### Change Reminder Intervals

Edit `notificationScheduler.js`:

```javascript
const REMINDER_DAYS = [7, 3, 2, 1, 0];  // Add or remove days
```

### Change Schedule Time

Edit `notificationScheduler.js`:

```javascript
// Current: Daily at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  await checkAndSendReminders();
});

// Example: Every day at 8:30 AM
cron.schedule('30 8 * * *', async () => {
  await checkAndSendReminders();
});

// Example: Multiple times per day (9 AM and 5 PM)
cron.schedule('0 9,17 * * *', async () => {
  await checkAndSendReminders();
});
```

### Customize Email Template

Edit `emailService.js` - Function `getDepartureEmailTemplate()`:
- Modify HTML structure
- Change colors and styling
- Add/remove sections
- Update branding

---

## 🐛 Troubleshooting

### Email Not Sending

1. **Check server logs** for error messages
2. **Verify SMTP credentials** in .env file
3. **Test connection:**
   ```bash
   curl -X POST http://localhost:3000/api/email/test \
     -H "Authorization: Bearer TOKEN" \
     -d '{"email":"your-email@example.com"}'
   ```

### Gmail "Less Secure Apps" Error

- Use **App Password**, not your regular Gmail password
- Enable 2-Step Verification first
- Generate new app password if existing one doesn't work

### No Reminders Being Sent

1. **Check staff user email addresses** - Tours need the assigned staff to have a valid email in the users table
2. **Verify tour status** - Tours with status "tidak jalan" are skipped
3. **Check departure dates** - Only upcoming tours are processed
4. **View reminder stats** to see what was sent:
   ```bash
   curl http://localhost:3000/api/email/reminder-stats -H "Authorization: Bearer TOKEN"
   ```

### Duplicate Emails

- The system prevents duplicates automatically
- Check `email_reminders` table for sent history
- If duplicates occur, check for multiple server instances running

---

## 📈 Monitoring

### View Logs

```bash
# Check email service status
grep "Email service" logs/app.log

# Check scheduler status  
grep "scheduler" logs/app.log

# Check sent reminders
grep "reminder sent" logs/app.log
```

### Database Queries

```sql
-- View all sent reminders today
SELECT * FROM email_reminders 
WHERE DATE(sent_at) = DATE('now');

-- Count reminders by interval
SELECT days_until_departure, COUNT(*) as count
FROM email_reminders
GROUP BY days_until_departure;

-- Find tours without staff email addresses
SELECT tour_code, lead_passenger, staff_name
FROM tours t
LEFT JOIN users u ON t.staff_name = u.name
WHERE (u.email IS NULL OR u.email = '')
AND departure_date >= DATE('now');
```

---

## 🔒 Security Notes

1. **Never commit .env file** - It contains sensitive SMTP credentials
2. **Use App Passwords** - Don't use your main email password
3. **Restrict API access** - Email endpoints require admin authentication
4. **Monitor usage** - Check logs regularly for suspicious activity
5. **Rate limiting** - Consider adding email rate limits for production

---

## 📞 Support

For issues or questions:
1. Check server logs in `logs/app.log`
2. Review this documentation
3. Test email connection with `/api/email/test`
4. Contact system administrator

---

## 🎯 Production Checklist

Before deploying to production:

- [ ] Set strong JWT_SECRET in .env
- [ ] Configure production SMTP server
- [ ] Test email delivery to real addresses
- [ ] Verify scheduler is running (check logs)
- [ ] Set up log monitoring/alerts
- [ ] Document SMTP credentials securely
- [ ] Test manual trigger endpoint
- [ ] Review and customize email templates
- [ ] Set appropriate reminder intervals
- [ ] Configure backup email addresses for staff

---

**Version:** 1.0.0  
**Last Updated:** November 30, 2025
