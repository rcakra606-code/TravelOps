import cron from 'node-cron';
import { sendDepartureReminder, sendCruiseReminder, sendReturnArrivalReminder, sendTicketDepartureReminder, sendTicketArrivalReminder, sendOpenTicketReminder } from './emailService.js';
import { logger } from './logger.js';

// Reminder intervals in days before departure/sailing/return
const TOUR_REMINDER_DAYS = [7, 3, 2, 1, 0];
const CRUISE_REMINDER_DAYS = [30, 15, 7, 3, 2, 1];
const RETURN_REMINDER_DAYS = [3, 2, 1, 0]; // Days before return to Jakarta
const TICKET_REMINDER_DAYS = [7, 3, 2, 1, 0]; // Days before flight departure

let db;
let schedulerActive = false;

/**
 * Get CREATE TABLE statement compatible with both SQLite and PostgreSQL
 */
function getCreateTableSQL() {
  const isPostgres = db.dialect === 'postgres';
  
  if (isPostgres) {
    return `
      CREATE TABLE IF NOT EXISTS email_reminders (
        id SERIAL PRIMARY KEY,
        tour_id INTEGER NOT NULL,
        days_until_departure INTEGER NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tour_id, days_until_departure)
      )
    `;
  } else {
    return `
      CREATE TABLE IF NOT EXISTS email_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tour_id INTEGER NOT NULL,
        days_until_departure INTEGER NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tour_id, days_until_departure)
      )
    `;
  }
}

/**
 * Initialize the notification scheduler
 */
function initScheduler(database) {
  if (!database) {
    logger.warn('Database not provided to scheduler - email notifications disabled');
    return;
  }
  
  db = database;
  
  // Run daily at 9:00 AM Jakarta time (Asia/Jakarta = UTC+7)
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running daily tour, cruise, and ticket reminder check...');
    try {
      await checkAndSendReminders();
      await checkAndSendCruiseReminders();
      await checkAndSendReturnReminders();
      await checkAndSendTicketReminders();
      await checkAndSendOpenTicketReminders();
    } catch (error) {
      logger.error({ error: error.message }, 'Error in scheduled reminder check');
    }
  }, {
    timezone: 'Asia/Jakarta'
  });

  // Optional: Run every hour during business hours (9 AM - 6 PM)
  // cron.schedule('0 9-18 * * *', async () => {
  //   await checkAndSendReminders();
  //   await checkAndSendCruiseReminders();
  //   await checkAndSendReturnReminders();
  // });

  schedulerActive = true;
  logger.info('Tour, Cruise, Return arrival and Open ticket reminder scheduler initialized - Daily at 9:00 AM Asia/Jakarta (UTC+7)');
  logger.info('Note: Email reminders require SMTP configuration to function');
  
  // Run once on startup for testing (optional - commented out by default)
  // checkAndSendReminders();
}

/**
 * Check for tours that need reminders and send emails
 */
async function checkAndSendReminders() {
  try {
    // Use Jakarta timezone for consistent date calculations
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
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
      if (TOUR_REMINDER_DAYS.includes(daysUntil)) {
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
async function getUpcomingTours() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const sql = `
      SELECT 
        t.*,
        r.region_name,
        u.username as staff_username,
        u.email as staff_email
      FROM tours t
      LEFT JOIN regions r ON t.region_id = r.id
      LEFT JOIN users u ON t.staff_name = u.name
      WHERE t.departure_date >= ?
        AND t.status != 'tidak jalan'
        AND u.email IS NOT NULL
        AND u.email != ''
      ORDER BY t.departure_date ASC
    `;

    const rows = await db.all(sql, [today]);
    return rows || [];
  } catch (err) {
    logger.error('Error getting upcoming tours:', err);
    return [];
  }
}

/**
 * Check if a reminder has already been sent
 */
async function checkReminderSent(tourId, daysUntil) {
  try {
    // First, ensure the table exists
    await db.run(getCreateTableSQL());

    // Check if reminder exists
    const sql = `
      SELECT COUNT(*) as count 
      FROM email_reminders 
      WHERE tour_id = ? AND days_until_departure = ?
    `;

    const row = await db.get(sql, [tourId, daysUntil]);
    return row && row.count > 0;
  } catch (err) {
    logger.error('Error checking reminder sent:', err);
    return false;
  }
}

/**
 * Record that a reminder was sent
 */
async function recordReminderSent(tourId, daysUntil) {
  try {
    // Handle INSERT OR IGNORE for both SQLite and Postgres
    const isPostgres = db.dialect === 'postgres';
    const sql = isPostgres
      ? `INSERT INTO email_reminders (tour_id, days_until_departure) VALUES (?, ?) ON CONFLICT (tour_id, days_until_departure) DO NOTHING`
      : `INSERT OR IGNORE INTO email_reminders (tour_id, days_until_departure) VALUES (?, ?)`;

    await db.run(sql, [tourId, daysUntil]);
  } catch (err) {
    logger.error('Error recording reminder sent:', err);
    throw err;
  }
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
async function getReminderStats() {
  try {
    // First ensure the table exists
    await db.run(getCreateTableSQL());

    // Handle date formatting for both SQLite and Postgres
    const isPostgres = db.dialect === 'postgres';
    const dateFunc = isPostgres ? "DATE(sent_at)" : "DATE(sent_at)";
    
    // Now get the statistics
    const sql = `
      SELECT 
        days_until_departure,
        COUNT(*) as count,
        ${dateFunc} as sent_date
      FROM email_reminders
      GROUP BY days_until_departure, ${dateFunc}
      ORDER BY sent_date DESC, days_until_departure DESC
      LIMIT 50
    `;

    const rows = await db.all(sql, []);
    return rows || [];
  } catch (err) {
    logger.error('Error fetching reminder stats:', err);
    // Return empty array instead of throwing
    return [];
  }
}

/**
 * Check for cruises that need reminders and send emails
 */
async function checkAndSendCruiseReminders() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logger.info('Checking for cruises requiring sailing reminders...');

    // Get all upcoming cruises
    const cruises = await getUpcomingCruises();
    
    if (cruises.length === 0) {
      logger.info('No upcoming cruises found');
      return;
    }

    logger.info(`Found ${cruises.length} upcoming cruises`);

    const remindersSent = [];
    const errors = [];

    for (const cruise of cruises) {
      const sailingDate = new Date(cruise.sailing_start);
      sailingDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((sailingDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if this cruise needs a reminder today
      if (CRUISE_REMINDER_DAYS.includes(daysUntil)) {
        // Check if reminder was already sent for this day
        const alreadySent = await checkCruiseReminderSent(cruise.id, daysUntil);
        
        if (!alreadySent) {
          logger.info(`Sending ${daysUntil}-day cruise reminder for ${cruise.ship_name}`);
          
          const result = await sendCruiseReminder(cruise, daysUntil);
          
          if (result.success) {
            await recordCruiseReminderSent(cruise.id, daysUntil);
            remindersSent.push({ cruise: cruise.ship_name, days: daysUntil });
          } else {
            errors.push({ cruise: cruise.ship_name, days: daysUntil, error: result.error });
          }
          
          // Add delay between emails to avoid rate limiting
          await delay(1000);
        } else {
          logger.info(`Reminder already sent for cruise ${cruise.ship_name} (${daysUntil} days)`);
        }
      }
    }

    // Log summary
    if (remindersSent.length > 0) {
      logger.info(`Successfully sent ${remindersSent.length} cruise reminders`);
    }
    if (errors.length > 0) {
      logger.error(`Failed to send ${errors.length} cruise reminders:`, errors);
    }

    return { sent: remindersSent, errors };
  } catch (error) {
    logger.error('Error in checkAndSendCruiseReminders:', error);
    throw error;
  }
}

/**
 * Get all upcoming cruises from database
 */
async function getUpcomingCruises() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const sql = `
      SELECT 
        c.*,
        u.email as staff_email
      FROM cruise c
      LEFT JOIN users u ON c.staff_name = u.name
      WHERE c.sailing_start >= ?
        AND u.email IS NOT NULL
        AND u.email != ''
      ORDER BY c.sailing_start ASC
    `;

    const rows = await db.all(sql, [today]);
    return rows || [];
  } catch (err) {
    logger.error('Error getting upcoming cruises:', err);
    return [];
  }
}

/**
 * Check if a cruise reminder has already been sent
 */
async function checkCruiseReminderSent(cruiseId, daysUntil) {
  try {
    // First, ensure the table exists
    const createTableSql = db.dialect === 'postgres' 
      ? `CREATE TABLE IF NOT EXISTS cruise_reminders (
          id SERIAL PRIMARY KEY,
          cruise_id INTEGER NOT NULL,
          days_until_sailing INTEGER NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(cruise_id, days_until_sailing)
        )`
      : `CREATE TABLE IF NOT EXISTS cruise_reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cruise_id INTEGER NOT NULL,
          days_until_sailing INTEGER NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(cruise_id, days_until_sailing)
        )`;

    await db.run(createTableSql);

    // Check if reminder exists
    const sql = `
      SELECT COUNT(*) as count 
      FROM cruise_reminders 
      WHERE cruise_id = ? AND days_until_sailing = ?
    `;

    const row = await db.get(sql, [cruiseId, daysUntil]);
    return row && row.count > 0;
  } catch (err) {
    logger.error('Error checking cruise reminder sent:', err);
    return false;
  }
}

/**
 * Record that a cruise reminder was sent
 */
async function recordCruiseReminderSent(cruiseId, daysUntil) {
  try {
    // Handle INSERT OR IGNORE for both SQLite and Postgres
    const isPostgres = db.dialect === 'postgres';
    const sql = isPostgres
      ? `INSERT INTO cruise_reminders (cruise_id, days_until_sailing) VALUES (?, ?) ON CONFLICT (cruise_id, days_until_sailing) DO NOTHING`
      : `INSERT OR IGNORE INTO cruise_reminders (cruise_id, days_until_sailing) VALUES (?, ?)`;

    await db.run(sql, [cruiseId, daysUntil]);
  } catch (err) {
    logger.error('Error recording cruise reminder sent:', err);
    throw err;
  }
}

/**
 * Check for tours that need return arrival reminders and send emails
 */
async function checkAndSendReturnReminders() {
  try {
    // Use Jakarta timezone for consistent date calculations
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    today.setHours(0, 0, 0, 0);

    logger.info('Checking for tours requiring return arrival reminders...');

    // Get all tours with upcoming return dates
    const tours = await getToursWithUpcomingReturn();
    
    if (tours.length === 0) {
      logger.info('No tours with upcoming return dates found');
      return;
    }

    logger.info(`Found ${tours.length} tours with upcoming return dates`);

    const remindersSent = [];
    const errors = [];

    for (const tour of tours) {
      const returnDate = new Date(tour.return_date);
      returnDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((returnDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if this tour needs a return reminder today
      if (RETURN_REMINDER_DAYS.includes(daysUntil)) {
        // Check if reminder was already sent for this day
        const alreadySent = await checkReturnReminderSent(tour.id, daysUntil);
        
        if (!alreadySent) {
          logger.info(`Sending ${daysUntil}-day return arrival reminder for tour ${tour.tour_code}`);
          
          const result = await sendReturnArrivalReminder(tour, daysUntil);
          
          if (result.success) {
            await recordReturnReminderSent(tour.id, daysUntil);
            remindersSent.push({ tour: tour.tour_code, days: daysUntil });
          } else {
            errors.push({ tour: tour.tour_code, days: daysUntil, error: result.error });
          }
          
          // Add delay between emails to avoid rate limiting
          await delay(1000);
        } else {
          logger.info(`Return reminder already sent for tour ${tour.tour_code} (${daysUntil} days)`);
        }
      }
    }

    // Log summary
    if (remindersSent.length > 0) {
      logger.info(`Successfully sent ${remindersSent.length} return arrival reminders`);
    }
    if (errors.length > 0) {
      logger.error(`Failed to send ${errors.length} return reminders:`, errors);
    }

    return { sent: remindersSent, errors };
  } catch (error) {
    logger.error('Error in checkAndSendReturnReminders:', error);
    throw error;
  }
}

/**
 * Get all tours with upcoming return dates from database
 */
async function getToursWithUpcomingReturn() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const sql = `
      SELECT 
        t.*,
        r.region_name,
        u.username as staff_username,
        u.email as staff_email
      FROM tours t
      LEFT JOIN regions r ON t.region_id = r.id
      LEFT JOIN users u ON t.staff_name = u.name
      WHERE t.return_date IS NOT NULL
        AND t.return_date != ''
        AND t.return_date >= ?
        AND t.status != 'tidak jalan'
        AND u.email IS NOT NULL
        AND u.email != ''
      ORDER BY t.return_date ASC
    `;

    const rows = await db.all(sql, [today]);
    return rows || [];
  } catch (err) {
    logger.error('Error getting tours with upcoming return:', err);
    return [];
  }
}

/**
 * Check if a return reminder has already been sent
 */
async function checkReturnReminderSent(tourId, daysUntil) {
  try {
    // First, ensure the table exists
    const createTableSql = db.dialect === 'postgres' 
      ? `CREATE TABLE IF NOT EXISTS return_reminders (
          id SERIAL PRIMARY KEY,
          tour_id INTEGER NOT NULL,
          days_until_return INTEGER NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tour_id, days_until_return)
        )`
      : `CREATE TABLE IF NOT EXISTS return_reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tour_id INTEGER NOT NULL,
          days_until_return INTEGER NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tour_id, days_until_return)
        )`;

    await db.run(createTableSql);

    // Check if reminder exists
    const sql = `
      SELECT COUNT(*) as count 
      FROM return_reminders 
      WHERE tour_id = ? AND days_until_return = ?
    `;

    const row = await db.get(sql, [tourId, daysUntil]);
    return row && row.count > 0;
  } catch (err) {
    logger.error('Error checking return reminder sent:', err);
    return false;
  }
}

/**
 * Record that a return reminder was sent
 */
async function recordReturnReminderSent(tourId, daysUntil) {
  try {
    // Handle INSERT OR IGNORE for both SQLite and Postgres
    const isPostgres = db.dialect === 'postgres';
    const sql = isPostgres
      ? `INSERT INTO return_reminders (tour_id, days_until_return) VALUES (?, ?) ON CONFLICT (tour_id, days_until_return) DO NOTHING`
      : `INSERT OR IGNORE INTO return_reminders (tour_id, days_until_return) VALUES (?, ?)`;

    await db.run(sql, [tourId, daysUntil]);
  } catch (err) {
    logger.error('Error recording return reminder sent:', err);
    throw err;
  }
}

// ===================================================================
// TICKET RECAP REMINDERS
// ===================================================================

/**
 * Check for tickets that need departure/arrival reminders
 */
async function checkAndSendTicketReminders() {
  try {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    logger.info('Checking for tickets requiring flight reminders...');
    
    // Get all active tickets with upcoming departures
    const tickets = await getUpcomingTickets();
    
    if (tickets.length === 0) {
      logger.info('No upcoming ticket departures found');
      return;
    }
    
    logger.info(`Found ${tickets.length} upcoming tickets to check`);
    
    const remindersSent = [];
    const errors = [];
    
    for (const ticket of tickets) {
      // Get first segment for departure check
      const firstSegment = ticket.segments?.[0];
      const lastSegment = ticket.segments?.[ticket.segments.length - 1];
      
      if (!firstSegment) continue;
      
      // Check departure reminders
      if (firstSegment.departure_date) {
        const departureDate = new Date(firstSegment.departure_date);
        departureDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
        
        if (TICKET_REMINDER_DAYS.includes(daysUntil)) {
          const reminderField = `reminder_sent_${daysUntil}d`;
          
          if (!ticket[reminderField]) {
            logger.info(`Sending ${daysUntil}-day departure reminder for ticket ${ticket.booking_code}`);
            
            const result = await sendTicketDepartureReminder(ticket, daysUntil);
            
            if (result.success) {
              await updateTicketReminderSent(ticket.id, reminderField);
              remindersSent.push({ ticket: ticket.booking_code, type: 'departure', days: daysUntil });
            } else {
              errors.push({ ticket: ticket.booking_code, type: 'departure', error: result.error });
            }
            
            await delay(1000);
          }
        }
      }
      
      // Check arrival reminders (only for today)
      if (lastSegment?.arrival_date === todayStr && !ticket.arrival_reminder_sent) {
        logger.info(`Sending arrival reminder for ticket ${ticket.booking_code}`);
        
        const result = await sendTicketArrivalReminder(ticket);
        
        if (result.success) {
          await updateTicketReminderSent(ticket.id, 'arrival_reminder_sent');
          remindersSent.push({ ticket: ticket.booking_code, type: 'arrival' });
        } else {
          errors.push({ ticket: ticket.booking_code, type: 'arrival', error: result.error });
        }
        
        await delay(1000);
      }
    }
    
    if (remindersSent.length > 0) {
      logger.info(`Successfully sent ${remindersSent.length} ticket reminders`);
    }
    if (errors.length > 0) {
      logger.error(`Failed to send ${errors.length} ticket reminders:`, errors);
    }
    
    return { sent: remindersSent, errors };
  } catch (error) {
    logger.error('Error in checkAndSendTicketReminders:', error);
    throw error;
  }
}

/**
 * Get upcoming tickets with segments and staff email
 */
async function getUpcomingTickets() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get active tickets with staff email
    const sql = `
      SELECT DISTINCT 
        tr.*,
        u.email as staff_email
      FROM ticket_recaps tr
      INNER JOIN ticket_segments ts ON ts.ticket_id = tr.id
      LEFT JOIN users u ON tr.staff_name = u.name
      WHERE tr.status = 'Active'
        AND (ts.departure_date >= ? OR ts.arrival_date = ?)
        AND ts.departure_date <= ?
        AND u.email IS NOT NULL
        AND u.email != ''
      ORDER BY ts.departure_date ASC
    `;
    
    const tickets = await db.all(sql, [today, today, sevenDaysFromNow]);
    
    // Get segments for each ticket
    for (const ticket of tickets) {
      const segments = await db.all(
        'SELECT * FROM ticket_segments WHERE ticket_id = ? ORDER BY segment_order ASC',
        [ticket.id]
      );
      ticket.segments = segments;
    }
    
    return tickets || [];
  } catch (err) {
    logger.error('Error getting upcoming tickets:', err);
    return [];
  }
}

/**
 * Update ticket reminder sent flag
 */
async function updateTicketReminderSent(ticketId, field) {
  try {
    const sql = `UPDATE ticket_recaps SET ${field} = 1 WHERE id = ?`;
    await db.run(sql, [ticketId]);
  } catch (err) {
    logger.error('Error updating ticket reminder sent:', err);
    throw err;
  }
}

/**
 * Check for open tickets and send daily reminders
 * Open tickets are tickets with flexible dates that need staff attention
 */
async function checkAndSendOpenTicketReminders() {
  try {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const todayStr = today.toISOString().split('T')[0];
    
    logger.info('Checking for open tickets requiring daily reminders...');
    
    // Get all active open tickets that haven't been reminded today
    const openTickets = await getActiveOpenTickets(todayStr);
    
    if (openTickets.length === 0) {
      logger.info('No open tickets requiring daily reminders');
      return;
    }
    
    logger.info(`Found ${openTickets.length} open tickets to remind`);
    
    const remindersSent = [];
    const errors = [];
    
    for (const ticket of openTickets) {
      logger.info(`Sending daily open ticket reminder for ${ticket.booking_code} to ${ticket.staff_email}`);
      
      const result = await sendOpenTicketReminder(ticket);
      
      if (result.success) {
        await updateOpenTicketReminderDate(ticket.id, todayStr);
        remindersSent.push({ ticket: ticket.booking_code, staff: ticket.staff_name });
      } else {
        errors.push({ ticket: ticket.booking_code, error: result.error });
      }
      
      await delay(1000); // Rate limiting
    }
    
    if (remindersSent.length > 0) {
      logger.info(`Successfully sent ${remindersSent.length} open ticket reminders`);
    }
    if (errors.length > 0) {
      logger.error(`Failed to send ${errors.length} open ticket reminders:`, errors);
    }
    
    return { sent: remindersSent, errors };
  } catch (error) {
    logger.error('Error in checkAndSendOpenTicketReminders:', error);
    throw error;
  }
}

/**
 * Get all active open tickets that haven't been reminded today
 */
async function getActiveOpenTickets(todayStr) {
  try {
    const sql = `
      SELECT 
        tr.*,
        u.email as staff_email
      FROM ticket_recaps tr
      LEFT JOIN users u ON tr.staff_name = u.name
      WHERE tr.is_open_ticket = 1
        AND tr.status = 'Active'
        AND (tr.open_ticket_reminder_sent_date IS NULL OR tr.open_ticket_reminder_sent_date != ?)
        AND u.email IS NOT NULL
        AND u.email != ''
    `;
    
    const tickets = await db.all(sql, [todayStr]);
    
    // Get segments for each ticket
    for (const ticket of tickets) {
      const segments = await db.all(
        'SELECT * FROM ticket_segments WHERE ticket_id = ? ORDER BY segment_order ASC',
        [ticket.id]
      );
      ticket.segments = segments;
    }
    
    return tickets || [];
  } catch (err) {
    logger.error('Error getting active open tickets:', err);
    return [];
  }
}

/**
 * Update the open ticket reminder sent date
 */
async function updateOpenTicketReminderDate(ticketId, dateStr) {
  try {
    const sql = `UPDATE ticket_recaps SET open_ticket_reminder_sent_date = ? WHERE id = ?`;
    await db.run(sql, [dateStr, ticketId]);
  } catch (err) {
    logger.error('Error updating open ticket reminder date:', err);
    throw err;
  }
}

export {
  initScheduler,
  checkAndSendReminders,
  checkAndSendCruiseReminders,
  checkAndSendReturnReminders,
  checkAndSendTicketReminders,
  checkAndSendOpenTicketReminders,
  manualTrigger,
  getReminderStats
};
