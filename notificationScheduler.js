import cron from 'node-cron';
import { sendDepartureReminder } from './emailService.js';
import { logger } from './logger.js';

// Reminder intervals in days before departure
const REMINDER_DAYS = [7, 3, 2, 1, 0];

let db;
let schedulerActive = false;

/**
 * Initialize the notification scheduler
 */
function initScheduler(database) {
  db = database;
  
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running daily departure reminder check...');
    await checkAndSendReminders();
  });

  // Optional: Run every hour during business hours (9 AM - 6 PM)
  // cron.schedule('0 9-18 * * *', async () => {
  //   await checkAndSendReminders();
  // });

  schedulerActive = true;
  logger.info('Departure reminder scheduler initialized - Daily at 9:00 AM');
  
  // Run once on startup for testing (optional)
  // checkAndSendReminders();
}

/**
 * Check for tours that need reminders and send emails
 */
async function checkAndSendReminders() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logger.info('Checking for tours requiring departure reminders...');

    // Get all upcoming tours that haven't departed yet
    const tours = await getUpcomingTours();
    
    if (tours.length === 0) {
      logger.info('No upcoming tours found');
      return;
    }

    logger.info(`Found ${tours.length} upcoming tours`);

    const remindersSent = [];
    const errors = [];

    for (const tour of tours) {
      const departureDate = new Date(tour.departure_date);
      departureDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if this tour needs a reminder today
      if (REMINDER_DAYS.includes(daysUntil)) {
        // Check if reminder was already sent for this day
        const alreadySent = await checkReminderSent(tour.id, daysUntil);
        
        if (!alreadySent) {
          logger.info(`Sending ${daysUntil}-day reminder for tour ${tour.tour_code}`);
          
          const result = await sendDepartureReminder(tour, daysUntil);
          
          if (result.success) {
            await recordReminderSent(tour.id, daysUntil);
            remindersSent.push({ tour: tour.tour_code, days: daysUntil });
          } else {
            errors.push({ tour: tour.tour_code, days: daysUntil, error: result.error });
          }
          
          // Add delay between emails to avoid rate limiting
          await delay(1000);
        } else {
          logger.info(`Reminder already sent for tour ${tour.tour_code} (${daysUntil} days)`);
        }
      }
    }

    // Log summary
    if (remindersSent.length > 0) {
      logger.info(`Successfully sent ${remindersSent.length} departure reminders`);
    }
    if (errors.length > 0) {
      logger.error(`Failed to send ${errors.length} reminders:`, errors);
    }

    return { sent: remindersSent, errors };
  } catch (error) {
    logger.error('Error in checkAndSendReminders:', error);
    throw error;
  }
}

/**
 * Get all upcoming tours from database
 */
function getUpcomingTours() {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    
    const sql = `
      SELECT 
        t.*,
        r.region_name,
        u.username as staff_username
      FROM tours t
      LEFT JOIN regions r ON t.region_id = r.id
      LEFT JOIN users u ON t.staff_name = u.name
      WHERE t.departure_date >= ?
        AND t.status != 'tidak jalan'
        AND t.email IS NOT NULL
        AND t.email != ''
      ORDER BY t.departure_date ASC
    `;

    db.all(sql, [today], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Check if a reminder has already been sent
 */
function checkReminderSent(tourId, daysUntil) {
  return new Promise((resolve, reject) => {
    // First, ensure the table exists
    db.run(`
      CREATE TABLE IF NOT EXISTS email_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tour_id INTEGER NOT NULL,
        days_until_departure INTEGER NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tour_id, days_until_departure)
      )
    `, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Check if reminder exists
      const sql = `
        SELECT COUNT(*) as count 
        FROM email_reminders 
        WHERE tour_id = ? AND days_until_departure = ?
      `;

      db.get(sql, [tourId, daysUntil], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count > 0);
        }
      });
    });
  });
}

/**
 * Record that a reminder was sent
 */
function recordReminderSent(tourId, daysUntil) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR IGNORE INTO email_reminders (tour_id, days_until_departure)
      VALUES (?, ?)
    `;

    db.run(sql, [tourId, daysUntil], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

/**
 * Delay helper function
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Manually trigger reminder check (for testing)
 */
async function manualTrigger() {
  logger.info('Manual trigger: Checking for reminders...');
  return await checkAndSendReminders();
}

/**
 * Get reminder statistics
 */
function getReminderStats() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        days_until_departure,
        COUNT(*) as count,
        DATE(sent_at) as sent_date
      FROM email_reminders
      GROUP BY days_until_departure, DATE(sent_at)
      ORDER BY sent_date DESC, days_until_departure DESC
      LIMIT 50
    `;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

export {
  initScheduler,
  checkAndSendReminders,
  manualTrigger,
  getReminderStats
};
