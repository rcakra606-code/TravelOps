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
    
    // First, let's log total upcoming tours for debugging
    const totalSql = `
      SELECT COUNT(*) as total
      FROM tours t
      WHERE t.departure_date >= ?
        AND t.status != 'tidak jalan'
    `;
    const totalRow = await db.get(totalSql, [today]);
    logger.info(`Total upcoming tours (departure >= ${today}): ${totalRow?.total || 0}`);
    
    const sql = `
      SELECT 
        t.*,
        r.region_name,
        u.username as staff_username,
        u.email as staff_email,
        u.name as user_name
      FROM tours t
      LEFT JOIN regions r ON t.region_id = r.id
      LEFT JOIN users u ON t.staff_name = u.name
      WHERE t.departure_date >= ?
        AND t.status != 'tidak jalan'
      ORDER BY t.departure_date ASC
    `;

    const rows = await db.all(sql, [today]);
    
    // Log diagnostic info
    const withEmail = rows.filter(r => r.staff_email && r.staff_email.trim() !== '');
    const withoutEmail = rows.filter(r => !r.staff_email || r.staff_email.trim() === '');
    
    logger.info(`Tours with staff email: ${withEmail.length}, without email: ${withoutEmail.length}`);
    
    if (withoutEmail.length > 0) {
      const staffNames = [...new Set(withoutEmail.map(r => r.staff_name).filter(Boolean))];
      logger.warn(`Staff without email configured: ${staffNames.join(', ')}`);
    }
    
    // Return only tours with email configured
    return withEmail;
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
 * Manually trigger ALL reminder checks (tours, cruise, return, tickets, open tickets)
 * This will send reminders for items within the reminder window
 */
async function manualTrigger() {
  logger.info('=== MANUAL TRIGGER: Starting ALL reminder checks ===');
  
  const results = {
    tours: { sent: [], errors: [], skipped: [] },
    cruise: { sent: [], errors: [], skipped: [] },
    return: { sent: [], errors: [], skipped: [] },
    tickets: { sent: [], errors: [], skipped: [] },
    openTickets: { sent: [], errors: [], skipped: [] }
  };
  
  try {
    // Use Jakarta timezone for consistent date calculations
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    // 1. TOUR DEPARTURE REMINDERS
    logger.info('--- Checking Tour Departure Reminders ---');
    const tours = await getUpcomingTours();
    logger.info(`Found ${tours.length} upcoming tours with email`);
    
    for (const tour of tours) {
      const departureDate = new Date(tour.departure_date);
      departureDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 7 && daysUntil >= 0) {
        const alreadySent = await checkReminderSent(tour.id, daysUntil);
        if (!alreadySent) {
          logger.info(`Sending tour reminder: ${tour.tour_code} (${daysUntil} days) to ${tour.staff_email}`);
          const result = await sendDepartureReminder(tour, daysUntil);
          if (result.success) {
            await recordReminderSent(tour.id, daysUntil);
            results.tours.sent.push({ code: tour.tour_code, days: daysUntil, email: tour.staff_email });
          } else {
            results.tours.errors.push({ code: tour.tour_code, days: daysUntil, error: result.error });
          }
          await delay(1000);
        } else {
          results.tours.skipped.push({ code: tour.tour_code, days: daysUntil, reason: 'already sent' });
        }
      }
    }
    
    // 2. CRUISE SAILING REMINDERS
    logger.info('--- Checking Cruise Sailing Reminders ---');
    const cruises = await getUpcomingCruises();
    logger.info(`Found ${cruises.length} upcoming cruises with email`);
    
    for (const cruise of cruises) {
      const sailingDate = new Date(cruise.sailing_start);
      sailingDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((sailingDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 30 && daysUntil >= 0) {
        const alreadySent = await checkCruiseReminderSent(cruise.id, daysUntil);
        if (!alreadySent) {
          logger.info(`Sending cruise reminder: ${cruise.ship_name} (${daysUntil} days) to ${cruise.staff_email}`);
          const result = await sendCruiseReminder(cruise, daysUntil);
          if (result.success) {
            await recordCruiseReminderSent(cruise.id, daysUntil);
            results.cruise.sent.push({ ship: cruise.ship_name, days: daysUntil, email: cruise.staff_email });
          } else {
            results.cruise.errors.push({ ship: cruise.ship_name, days: daysUntil, error: result.error });
          }
          await delay(1000);
        } else {
          results.cruise.skipped.push({ ship: cruise.ship_name, days: daysUntil, reason: 'already sent' });
        }
      }
    }
    
    // 3. RETURN ARRIVAL REMINDERS
    logger.info('--- Checking Return Arrival Reminders ---');
    const returnTours = await getToursWithUpcomingReturn();
    logger.info(`Found ${returnTours.length} tours with upcoming return dates`);
    
    for (const tour of returnTours) {
      const returnDate = new Date(tour.return_date);
      returnDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((returnDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 3 && daysUntil >= 0) {
        const alreadySent = await checkReturnReminderSent(tour.id, daysUntil);
        if (!alreadySent) {
          logger.info(`Sending return reminder: ${tour.tour_code} (${daysUntil} days) to ${tour.staff_email}`);
          const result = await sendReturnArrivalReminder(tour, daysUntil);
          if (result.success) {
            await recordReturnReminderSent(tour.id, daysUntil);
            results.return.sent.push({ code: tour.tour_code, days: daysUntil, email: tour.staff_email });
          } else {
            results.return.errors.push({ code: tour.tour_code, days: daysUntil, error: result.error });
          }
          await delay(1000);
        } else {
          results.return.skipped.push({ code: tour.tour_code, days: daysUntil, reason: 'already sent' });
        }
      }
    }
    
    // 4. TICKET DEPARTURE REMINDERS
    logger.info('--- Checking Ticket Flight Reminders ---');
    const tickets = await getUpcomingTickets();
    logger.info(`Found ${tickets.length} upcoming ticket departures`);
    
    for (const ticket of tickets) {
      if (!ticket.segments || ticket.segments.length === 0) continue;
      
      const firstSegment = ticket.segments[0];
      const departureDate = new Date(firstSegment.departure_date);
      departureDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 7 && daysUntil >= 0) {
        const alreadySent = await checkTicketReminderSent(ticket.id, daysUntil, 'departure');
        if (!alreadySent) {
          logger.info(`Sending ticket reminder: ${ticket.passenger_name} (${daysUntil} days) to ${ticket.staff_email}`);
          const result = await sendTicketDepartureReminder(ticket, daysUntil);
          if (result.success) {
            await recordTicketReminderSent(ticket.id, daysUntil, 'departure');
            results.tickets.sent.push({ passenger: ticket.passenger_name, days: daysUntil, email: ticket.staff_email });
          } else {
            results.tickets.errors.push({ passenger: ticket.passenger_name, days: daysUntil, error: result.error });
          }
          await delay(1000);
        } else {
          results.tickets.skipped.push({ passenger: ticket.passenger_name, days: daysUntil, reason: 'already sent' });
        }
      }
    }
    
    // 5. OPEN TICKET REMINDERS
    logger.info('--- Checking Open Ticket Reminders ---');
    const openTickets = await getActiveOpenTickets(todayStr);
    logger.info(`Found ${openTickets.length} active open tickets`);
    
    for (const ticket of openTickets) {
      logger.info(`Sending open ticket reminder: ${ticket.passenger_name} to ${ticket.staff_email}`);
      const result = await sendOpenTicketReminder(ticket);
      if (result.success) {
        await updateOpenTicketReminderDate(ticket.id, todayStr);
        results.openTickets.sent.push({ passenger: ticket.passenger_name, email: ticket.staff_email });
      } else {
        results.openTickets.errors.push({ passenger: ticket.passenger_name, error: result.error });
      }
      await delay(1000);
    }
    
    // Log summary
    const totalSent = results.tours.sent.length + results.cruise.sent.length + 
                      results.return.sent.length + results.tickets.sent.length + 
                      results.openTickets.sent.length;
    const totalErrors = results.tours.errors.length + results.cruise.errors.length + 
                        results.return.errors.length + results.tickets.errors.length + 
                        results.openTickets.errors.length;
    
    logger.info(`=== MANUAL TRIGGER SUMMARY ===`);
    logger.info(`Tours: ${results.tours.sent.length} sent, ${results.tours.errors.length} errors, ${results.tours.skipped.length} skipped`);
    logger.info(`Cruise: ${results.cruise.sent.length} sent, ${results.cruise.errors.length} errors, ${results.cruise.skipped.length} skipped`);
    logger.info(`Return: ${results.return.sent.length} sent, ${results.return.errors.length} errors, ${results.return.skipped.length} skipped`);
    logger.info(`Tickets: ${results.tickets.sent.length} sent, ${results.tickets.errors.length} errors, ${results.tickets.skipped.length} skipped`);
    logger.info(`Open Tickets: ${results.openTickets.sent.length} sent, ${results.openTickets.errors.length} errors`);
    logger.info(`TOTAL: ${totalSent} sent, ${totalErrors} errors`);
    
    return {
      sent: [...results.tours.sent, ...results.cruise.sent, ...results.return.sent, 
             ...results.tickets.sent, ...results.openTickets.sent],
      errors: [...results.tours.errors, ...results.cruise.errors, ...results.return.errors,
               ...results.tickets.errors, ...results.openTickets.errors],
      skipped: [...results.tours.skipped, ...results.cruise.skipped, ...results.return.skipped,
                ...results.tickets.skipped],
      breakdown: results,
      message: totalSent === 0 && totalErrors === 0 
        ? 'No reminders to send. Check: (1) upcoming items within reminder window, (2) staff email configured in Users'
        : null
    };
  } catch (error) {
    logger.error('Error in manualTrigger:', error);
    throw error;
  }
}

/**
 * Get reminder statistics — comprehensive stats from all reminder tables
 * Returns both a detailed rows array and an aggregated summary object
 */
async function getReminderStats() {
  try {
    // Ensure all reminder tables exist
    await db.run(getCreateTableSQL());
    const isPostgres = db.dialect === 'postgres';
    const cruiseTableSql = isPostgres
      ? `CREATE TABLE IF NOT EXISTS cruise_reminders (
          id SERIAL PRIMARY KEY, cruise_id INTEGER NOT NULL,
          days_until_sailing INTEGER NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(cruise_id, days_until_sailing))`
      : `CREATE TABLE IF NOT EXISTS cruise_reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT, cruise_id INTEGER NOT NULL,
          days_until_sailing INTEGER NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(cruise_id, days_until_sailing))`;
    await db.run(cruiseTableSql);
    const returnTableSql = isPostgres
      ? `CREATE TABLE IF NOT EXISTS return_reminders (
          id SERIAL PRIMARY KEY, tour_id INTEGER NOT NULL,
          days_until_return INTEGER NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tour_id, days_until_return))`
      : `CREATE TABLE IF NOT EXISTS return_reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT, tour_id INTEGER NOT NULL,
          days_until_return INTEGER NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tour_id, days_until_return))`;
    await db.run(returnTableSql);

    const dateFunc = isPostgres ? "TO_CHAR(sent_at, 'YYYY-MM-DD')" : "DATE(sent_at)";
    const today = new Date().toISOString().split('T')[0];

    // --- Detailed rows from all 3 tables ---
    const tourRows = await db.all(`
      SELECT 'tour' as type, days_until_departure as days_before, COUNT(*) as count, ${dateFunc} as sent_date
      FROM email_reminders GROUP BY days_until_departure, ${dateFunc}
      ORDER BY sent_date DESC LIMIT 30`, []);

    const cruiseRows = await db.all(`
      SELECT 'cruise' as type, days_until_sailing as days_before, COUNT(*) as count, ${dateFunc} as sent_date
      FROM cruise_reminders GROUP BY days_until_sailing, ${dateFunc}
      ORDER BY sent_date DESC LIMIT 30`, []);

    const returnRows = await db.all(`
      SELECT 'return' as type, days_until_return as days_before, COUNT(*) as count, ${dateFunc} as sent_date
      FROM return_reminders GROUP BY days_until_return, ${dateFunc}
      ORDER BY sent_date DESC LIMIT 30`, []);

    // Merge and sort by date desc
    const allRows = [...(tourRows || []), ...(cruiseRows || []), ...(returnRows || [])]
      .sort((a, b) => (b.sent_date || '').localeCompare(a.sent_date || ''));

    // --- Aggregated summary ---
    const tourTotal = await db.get('SELECT COUNT(*) as c FROM email_reminders', []);
    const cruiseTotal = await db.get('SELECT COUNT(*) as c FROM cruise_reminders', []);
    const returnTotal = await db.get('SELECT COUNT(*) as c FROM return_reminders', []);
    const totalSent = (tourTotal?.c || 0) + (cruiseTotal?.c || 0) + (returnTotal?.c || 0);

    // Upcoming tours (departure >= today, active)
    let upcomingTours = 0;
    try {
      const row = await db.get(
        "SELECT COUNT(*) as c FROM tours WHERE departure_date >= ? AND status != 'tidak jalan'", [today]);
      upcomingTours = row?.c || 0;
    } catch (_) { /* tours table may not exist */ }

    // Upcoming cruises
    let upcomingCruises = 0;
    try {
      const row = await db.get(
        "SELECT COUNT(*) as c FROM cruises WHERE sailing_start >= ?", [today]);
      upcomingCruises = row?.c || 0;
    } catch (_) { /* cruises table may not exist */ }

    // Pending = upcoming items within the 7-day reminder window that haven't been reminded yet
    let pendingReminders = 0;
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
      const row = await db.get(`
        SELECT COUNT(*) as c FROM tours t
        WHERE t.departure_date >= ? AND t.departure_date <= ?
          AND t.status != 'tidak jalan'
          AND t.id NOT IN (SELECT tour_id FROM email_reminders)`, [today, sevenDaysOut]);
      pendingReminders += (row?.c || 0);
    } catch (_) { /* table may not exist */ }
    try {
      const row = await db.get(`
        SELECT COUNT(*) as c FROM cruises c2
        WHERE c2.sailing_start >= ? AND c2.sailing_start <= ?
          AND c2.id NOT IN (SELECT cruise_id FROM cruise_reminders)`, [today, sevenDaysOut]);
      pendingReminders += (row?.c || 0);
    } catch (_) { /* table may not exist */ }

    // Recent activity (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentTour = await db.get(`SELECT COUNT(*) as c FROM email_reminders WHERE sent_at >= ?`, [weekAgo]);
    const recentCruise = await db.get(`SELECT COUNT(*) as c FROM cruise_reminders WHERE sent_at >= ?`, [weekAgo]);
    const recentReturn = await db.get(`SELECT COUNT(*) as c FROM return_reminders WHERE sent_at >= ?`, [weekAgo]);
    const sentThisWeek = (recentTour?.c || 0) + (recentCruise?.c || 0) + (recentReturn?.c || 0);

    return {
      rows: allRows,
      summary: {
        totalSent,
        toursSent: tourTotal?.c || 0,
        cruisesSent: cruiseTotal?.c || 0,
        returnsSent: returnTotal?.c || 0,
        upcomingTours,
        upcomingCruises,
        pendingReminders,
        sentThisWeek
      }
    };
  } catch (err) {
    logger.error('Error fetching reminder stats:', err);
    return { rows: [], summary: { totalSent: 0, upcomingTours: 0, upcomingCruises: 0, pendingReminders: 0, sentThisWeek: 0, toursSent: 0, cruisesSent: 0, returnsSent: 0 } };
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
