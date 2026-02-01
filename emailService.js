import nodemailer from 'nodemailer';
import { logger } from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Email configuration - Update these with your SMTP settings
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASSWORD || 'your-app-password'
  }
};

// Check if email is configured
const isEmailConfigured = process.env.SMTP_USER && 
                          process.env.SMTP_PASSWORD && 
                          process.env.SMTP_USER !== 'your-email@gmail.com';

if (!isEmailConfigured) {
  logger.warn('Email service not configured. Set SMTP_USER and SMTP_PASSWORD in environment variables.');
}

// Create reusable transporter only if configured
let transporter = null;

if (isEmailConfigured) {
  try {
    transporter = nodemailer.createTransport(emailConfig);
    
    // Verify connection configuration (async, non-blocking)
    transporter.verify(function(error, success) {
      if (error) {
        logger.warn({ error: error.message }, 'Email SMTP verification failed - please check credentials');
        logger.info('To configure email: Set SMTP_USER and SMTP_PASSWORD environment variables');
        logger.info('For Gmail: Use App Password from https://myaccount.google.com/apppasswords');
      } else {
        logger.info('✅ Email service is ready to send messages');
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create email transporter');
  }
} else {
  logger.info('📧 Email notifications disabled - Configure SMTP settings to enable');
  logger.info('Required: SMTP_USER and SMTP_PASSWORD environment variables');
}

/**
 * Send departure reminder email
 * @param {Object} tour - Tour details
 * @param {number} daysUntil - Days until departure
 */
async function sendDepartureReminder(tour, daysUntil) {
  if (!isEmailConfigured || !transporter) {
    logger.warn('Email service not configured - skipping departure reminder');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const subject = getDepartureSubject(daysUntil, tour.tour_code);
    const htmlContent = getDepartureEmailTemplate(tour, daysUntil);
    
    // Send to staff user's email instead of passenger
    if (!tour.staff_email) {
      logger.warn(`No staff email found for tour ${tour.tour_code}`);
      return { success: false, error: 'No staff email address' };
    }

    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: tour.staff_email,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Departure reminder sent for tour ${tour.tour_code} (${daysUntil} days) to ${tour.staff_email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send reminder for tour ${tour.tour_code}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate subject line based on days until departure
 */
function getDepartureSubject(daysUntil, tourCode) {
  if (daysUntil === 0) {
    return `🎉 Your Tour Departs TODAY! - ${tourCode}`;
  } else if (daysUntil === 1) {
    return `⏰ Reminder: Your Tour Departs TOMORROW - ${tourCode}`;
  } else {
    return `📅 Reminder: Your Tour Departs in ${daysUntil} Days - ${tourCode}`;
  }
}

/**
 * Generate HTML email template for departure reminder
 */
function getDepartureEmailTemplate(tour, daysUntil) {
  const urgencyLevel = daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low';
  const urgencyColor = urgencyLevel === 'high' ? '#dc2626' : urgencyLevel === 'medium' ? '#f59e0b' : '#2563eb';
  
  let messageText = '';
  if (daysUntil === 0) {
    messageText = '🎉 <strong>Your tour departs TODAY!</strong> We hope you have an amazing experience!';
  } else if (daysUntil === 1) {
    messageText = '⏰ <strong>Your tour departs TOMORROW!</strong> Please ensure you are ready for departure.';
  } else {
    messageText = `📅 Your tour departs in <strong>${daysUntil} days</strong>. Please prepare accordingly.`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 40px 30px; }
    .alert-box { background-color: ${urgencyColor}10; border-left: 4px solid ${urgencyColor}; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .tour-details { background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0; }
    .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #6b7280; width: 140px; flex-shrink: 0; }
    .detail-value { color: #1f2937; flex: 1; }
    .checklist { background-color: #ecfdf5; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #10b981; }
    .checklist h3 { margin-top: 0; color: #059669; }
    .checklist ul { margin: 10px 0; padding-left: 25px; }
    .checklist li { margin: 8px 0; color: #047857; }
    .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .countdown { text-align: center; font-size: 48px; font-weight: 700; color: ${urgencyColor}; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌍 TravelOps Tour Reminder</h1>
    </div>
    
    <div class="content">
      <div class="alert-box">
        <p style="margin: 0; font-size: 16px; line-height: 1.6;">${messageText}</p>
      </div>
      
      <div class="countdown">${daysUntil}</div>
      <p style="text-align: center; color: #6b7280; margin-top: -10px;">
        ${daysUntil === 0 ? 'Day' : daysUntil === 1 ? 'Day to go!' : 'Days to go!'}
      </p>

      <div class="tour-details">
        <h2 style="margin-top: 0; color: #1f2937; font-size: 20px;">Tour Details</h2>
        <div class="detail-row">
          <span class="detail-label">Tour Code:</span>
          <span class="detail-value"><strong>${tour.tour_code || '-'}</strong></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking Code:</span>
          <span class="detail-value">${tour.booking_code || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Departure Date:</span>
          <span class="detail-value"><strong style="color: ${urgencyColor};">${tour.departure_date || '-'}</strong></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Lead Passenger:</span>
          <span class="detail-value">${tour.lead_passenger || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Total Participants:</span>
          <span class="detail-value">${tour.jumlah_peserta || 0} people</span>
        </div>
        ${tour.all_passengers ? `
        <div class="detail-row">
          <span class="detail-label">All Passengers:</span>
          <span class="detail-value">${tour.all_passengers}</span>
        </div>
        ` : ''}
        ${tour.phone_number ? `
        <div class="detail-row">
          <span class="detail-label">Contact:</span>
          <span class="detail-value">${tour.phone_number}</span>
        </div>
        ` : ''}
        ${tour.remarks ? `
        <div class="detail-row">
          <span class="detail-label">Notes:</span>
          <span class="detail-value">${tour.remarks}</span>
        </div>
        ` : ''}
      </div>

      ${daysUntil <= 3 ? `
      <div class="checklist">
        <h3>✅ Pre-Departure Checklist</h3>
        <ul>
          <li>Confirm your passport is valid (6+ months)</li>
          <li>Check visa requirements for your destination</li>
          <li>Review travel insurance coverage</li>
          <li>Pack essential medications and prescriptions</li>
          <li>Confirm flight/transportation details</li>
          <li>Prepare copies of important documents</li>
          <li>Notify your bank of travel plans</li>
          <li>Charge all electronic devices</li>
        </ul>
      </div>
      ` : ''}

      ${tour.staff_name ? `
      <p style="margin-top: 30px; padding: 20px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #2563eb;">
        <strong>Your Tour Coordinator:</strong> ${tour.staff_name}<br>
        ${tour.staff_email ? `<span style="color: #6b7280;">Contact: ${tour.staff_email}</span>` : ''}
      </p>
      ` : ''}

      <p style="margin-top: 30px; color: #4b5563; line-height: 1.6;">
        If you have any questions or need to make changes to your booking, please contact us as soon as possible.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 5px 0;"><strong>TravelOps</strong></p>
      <p style="margin: 5px 0;">Travel Management System</p>
      <p style="margin: 15px 0; font-size: 12px; color: #9ca3af;">
        This is an automated reminder. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send test email
 */
async function sendTestEmail(toEmail) {
  if (!isEmailConfigured || !transporter) {
    return { success: false, error: 'Email service not configured. Please set SMTP credentials in environment variables.' };
  }
  
  try {
    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: toEmail,
      subject: '✅ TravelOps Email Service Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Email Service Test</h2>
          <p>This is a test email from TravelOps notification system.</p>
          <p>If you received this, the email service is configured correctly!</p>
          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Test email sent to ${toEmail}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send test email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send cruise sailing reminder email
 * @param {Object} cruise - Cruise details
 * @param {number} daysUntil - Days until sailing
 */
async function sendCruiseReminder(cruise, daysUntil) {
  if (!isEmailConfigured || !transporter) {
    logger.warn('Email service not configured - skipping cruise reminder');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const subject = getCruiseSubject(daysUntil, cruise.ship_name);
    const htmlContent = getCruiseEmailTemplate(cruise, daysUntil);
    
    // Send to staff user's email
    if (!cruise.staff_email) {
      logger.warn(`No staff email found for cruise ${cruise.ship_name}`);
      return { success: false, error: 'No staff email address' };
    }

    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: cruise.staff_email,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Cruise reminder sent for ${cruise.ship_name} (${daysUntil} days) to ${cruise.staff_email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send cruise reminder for ${cruise.ship_name}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate subject line based on days until sailing
 */
function getCruiseSubject(daysUntil, shipName) {
  if (daysUntil === 0) {
    return `⚓ Your Cruise Departs TODAY! - ${shipName}`;
  } else if (daysUntil === 1) {
    return `⏰ Reminder: Your Cruise Departs TOMORROW - ${shipName}`;
  } else if (daysUntil <= 7) {
    return `🚢 Reminder: Your Cruise Departs in ${daysUntil} Days - ${shipName}`;
  } else {
    return `📅 Upcoming Cruise Reminder: ${daysUntil} Days - ${shipName}`;
  }
}

/**
 * Generate HTML email template for cruise reminder
 */
function getCruiseEmailTemplate(cruise, daysUntil) {
  const urgencyLevel = daysUntil <= 2 ? 'high' : daysUntil <= 7 ? 'medium' : 'low';
  const urgencyColor = urgencyLevel === 'high' ? '#dc2626' : urgencyLevel === 'medium' ? '#f59e0b' : '#2563eb';
  
  let messageText = '';
  if (daysUntil === 0) {
    messageText = '⚓ <strong>Your cruise departs TODAY!</strong> Bon voyage!';
  } else if (daysUntil === 1) {
    messageText = '⏰ <strong>Your cruise departs TOMORROW!</strong> Please ensure all preparations are complete.';
  } else if (daysUntil <= 7) {
    messageText = `🚢 Your cruise departs in <strong>${daysUntil} days</strong>. Final preparations should be underway.`;
  } else {
    messageText = `📅 Your cruise departs in <strong>${daysUntil} days</strong>. Time to start planning!`;
  }

  // Format dates
  const sailingStart = new Date(cruise.sailing_start).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const sailingEnd = new Date(cruise.sailing_end).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #0891b2 0%, #1e40af 100%); padding: 40px 30px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 40px 30px; }
    .alert-box { background-color: ${urgencyColor}10; border-left: 4px solid ${urgencyColor}; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .cruise-details { background-color: #f0f9ff; padding: 25px; border-radius: 12px; margin: 25px 0; border: 2px solid #0891b2; }
    .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #e0f2fe; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #0c4a6e; width: 140px; flex-shrink: 0; }
    .detail-value { color: #1f2937; flex: 1; }
    .checklist { background-color: #ecfdf5; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #10b981; }
    .checklist h3 { margin-top: 0; color: #059669; }
    .checklist ul { margin: 10px 0; padding-left: 25px; }
    .checklist li { margin: 8px 0; color: #047857; }
    .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    .countdown { text-align: center; font-size: 48px; font-weight: 700; color: ${urgencyColor}; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚓ TravelOps Cruise Reminder</h1>
    </div>
    
    <div class="content">
      <div class="alert-box">
        <p style="margin: 0; font-size: 16px;">${messageText}</p>
      </div>
      
      <div class="countdown">${daysUntil}</div>
      <p style="text-align: center; color: #6b7280; margin-top: -10px;">
        ${daysUntil === 1 ? 'day' : 'days'} until sailing
      </p>
      
      <div class="cruise-details">
        <h2 style="margin-top: 0; color: #0c4a6e;">🚢 Cruise Details</h2>
        
        <div class="detail-row">
          <div class="detail-label">Cruise Brand:</div>
          <div class="detail-value"><strong>${cruise.cruise_brand || 'N/A'}</strong></div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Ship Name:</div>
          <div class="detail-value"><strong>${cruise.ship_name || 'N/A'}</strong></div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Route:</div>
          <div class="detail-value">${cruise.route || 'N/A'}</div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Sailing Start:</div>
          <div class="detail-value"><strong>${sailingStart}</strong></div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Sailing End:</div>
          <div class="detail-value"><strong>${sailingEnd}</strong></div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">PIC:</div>
          <div class="detail-value">${cruise.pic_name || 'N/A'}</div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Participants:</div>
          <div class="detail-value">${cruise.participant_names || 'N/A'}</div>
        </div>
        
        <div class="detail-row">
          <div class="detail-label">Reservation Code:</div>
          <div class="detail-value"><strong>${cruise.reservation_code || 'N/A'}</strong></div>
        </div>
        
        ${cruise.phone_number ? `
        <div class="detail-row">
          <div class="detail-label">Contact Phone:</div>
          <div class="detail-value">${cruise.phone_number}</div>
        </div>
        ` : ''}
        
        ${cruise.email ? `
        <div class="detail-row">
          <div class="detail-label">Contact Email:</div>
          <div class="detail-value">${cruise.email}</div>
        </div>
        ` : ''}
        
        <div class="detail-row">
          <div class="detail-label">Staff:</div>
          <div class="detail-value">${cruise.staff_name || 'N/A'}</div>
        </div>
      </div>
      
      ${daysUntil <= 7 ? `
      <div class="checklist">
        <h3>✅ Pre-Cruise Checklist</h3>
        <ul>
          <li>Verify all passenger documentation and passports</li>
          <li>Confirm reservation code with cruise line</li>
          <li>Check in with participants regarding embarkation time</li>
          <li>Review cruise itinerary and shore excursions</li>
          <li>Ensure contact information is current</li>
          <li>Prepare travel insurance documents</li>
          ${daysUntil <= 3 ? '<li><strong>Final confirmation with all participants</strong></li>' : ''}
          ${daysUntil <= 1 ? '<li><strong>Emergency contact confirmation</strong></li>' : ''}
        </ul>
      </div>
      ` : ''}
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        This is an automated reminder from TravelOps. Please ensure all cruise preparations are on track.
      </p>
    </div>
    
    <div class="footer">
      <p><strong>TravelOps</strong></p>
      <p>Travel Operations Management System</p>
      <p style="margin-top: 20px; font-size: 12px;">
        This email was sent to ${cruise.staff_email} as the assigned staff member for this cruise.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send return arrival reminder email to staff
 * Notifies staff that their guest has arrived back in Indonesia (Jakarta)
 * @param {Object} tour - Tour details
 * @param {number} daysUntil - Days until return (0 = today, negative = already returned)
 */
async function sendReturnArrivalReminder(tour, daysUntil) {
  if (!isEmailConfigured || !transporter) {
    logger.warn('Email service not configured - skipping return arrival reminder');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const subject = getReturnArrivalSubject(daysUntil, tour.tour_code);
    const htmlContent = getReturnArrivalEmailTemplate(tour, daysUntil);
    
    // Send to staff user's email
    if (!tour.staff_email) {
      logger.warn(`No staff email found for tour ${tour.tour_code}`);
      return { success: false, error: 'No staff email address' };
    }

    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: tour.staff_email,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Return arrival reminder sent for tour ${tour.tour_code} (${daysUntil} days) to ${tour.staff_email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send return arrival reminder for tour ${tour.tour_code}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate subject line based on days until return arrival
 */
function getReturnArrivalSubject(daysUntil, tourCode) {
  if (daysUntil === 0) {
    return `🛬 Guest Arrives in Jakarta TODAY! - ${tourCode}`;
  } else if (daysUntil === 1) {
    return `⏰ Guest Arrives in Jakarta TOMORROW - ${tourCode}`;
  } else {
    return `📅 Guest Return to Jakarta in ${daysUntil} Days - ${tourCode}`;
  }
}

/**
 * Generate HTML email template for return arrival reminder
 */
function getReturnArrivalEmailTemplate(tour, daysUntil) {
  const urgencyLevel = daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low';
  const urgencyColor = urgencyLevel === 'high' ? '#059669' : urgencyLevel === 'medium' ? '#0891b2' : '#2563eb';
  
  let messageText = '';
  if (daysUntil === 0) {
    messageText = '🛬 <strong>Your guest arrives back in Jakarta TODAY!</strong> Please prepare for their arrival and follow up.';
  } else if (daysUntil === 1) {
    messageText = '⏰ <strong>Your guest arrives back in Jakarta TOMORROW!</strong> Make sure everything is ready for their return.';
  } else {
    messageText = `📅 Your guest returns to Jakarta in <strong>${daysUntil} days</strong>. Plan any necessary follow-up actions.`;
  }

  // Format dates
  const returnDate = new Date(tour.return_date).toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  const departureDate = tour.departure_date ? new Date(tour.departure_date).toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  }) : 'N/A';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 40px 30px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 40px 30px; }
    .alert-box { background-color: ${urgencyColor}10; border-left: 4px solid ${urgencyColor}; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .tour-details { background-color: #ecfdf5; padding: 25px; border-radius: 12px; margin: 25px 0; border: 2px solid #10b981; }
    .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #d1fae5; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #047857; width: 140px; flex-shrink: 0; }
    .detail-value { color: #1f2937; flex: 1; }
    .checklist { background-color: #eff6ff; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #3b82f6; }
    .checklist h3 { margin-top: 0; color: #1d4ed8; }
    .checklist ul { margin: 10px 0; padding-left: 25px; }
    .checklist li { margin: 8px 0; color: #1e40af; }
    .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    .countdown { text-align: center; font-size: 48px; font-weight: 700; color: ${urgencyColor}; margin: 20px 0; }
    .welcome-badge { background-color: #059669; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛬 TravelOps Return Arrival Reminder</h1>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <span class="welcome-badge">Welcome Back to Indonesia!</span>
      </div>
      
      <div class="alert-box">
        <p style="margin: 0; font-size: 16px; line-height: 1.6;">${messageText}</p>
      </div>
      
      <div class="countdown">${daysUntil}</div>
      <p style="text-align: center; color: #6b7280; margin-top: -10px;">
        ${daysUntil === 0 ? 'Arriving Today!' : daysUntil === 1 ? 'Day until arrival' : 'Days until arrival'}
      </p>
      
      <div class="tour-details">
        <h2 style="margin-top: 0; color: #047857;">📋 Tour Details</h2>
        
        <div class="detail-row">
          <span class="detail-label">Tour Code:</span>
          <span class="detail-value"><strong>${tour.tour_code || 'N/A'}</strong></span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Booking Code:</span>
          <span class="detail-value">${tour.booking_code || 'N/A'}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Lead Passenger:</span>
          <span class="detail-value"><strong>${tour.lead_passenger || 'N/A'}</strong></span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Participants:</span>
          <span class="detail-value">${tour.jumlah_peserta || 0} people</span>
        </div>
        
        ${tour.all_passengers ? `
        <div class="detail-row">
          <span class="detail-label">All Passengers:</span>
          <span class="detail-value">${tour.all_passengers}</span>
        </div>
        ` : ''}
        
        <div class="detail-row">
          <span class="detail-label">Departure Date:</span>
          <span class="detail-value">${departureDate}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Return to Jakarta:</span>
          <span class="detail-value"><strong style="color: ${urgencyColor};">${returnDate}</strong></span>
        </div>
        
        ${tour.phone_number ? `
        <div class="detail-row">
          <span class="detail-label">Contact Phone:</span>
          <span class="detail-value">${tour.phone_number}</span>
        </div>
        ` : ''}
        
        ${tour.email ? `
        <div class="detail-row">
          <span class="detail-label">Contact Email:</span>
          <span class="detail-value">${tour.email}</span>
        </div>
        ` : ''}
        
        <div class="detail-row">
          <span class="detail-label">Region:</span>
          <span class="detail-value">${tour.region_name || 'N/A'}</span>
        </div>
      </div>
      
      <div class="checklist">
        <h3>✅ Post-Tour Follow-up Checklist</h3>
        <ul>
          <li>Confirm guest's safe arrival in Jakarta</li>
          <li>Send welcome back message to guest</li>
          <li>Request feedback or review about the tour experience</li>
          <li>Check if any documents need to be returned</li>
          <li>Follow up on any outstanding payments</li>
          <li>Update tour status in system if needed</li>
          ${daysUntil === 0 ? '<li><strong>Check airport pickup arrangements if applicable</strong></li>' : ''}
          ${daysUntil === 0 ? '<li><strong>Prepare any welcome back gifts or vouchers</strong></li>' : ''}
        </ul>
      </div>
      
      ${tour.remarks ? `
      <p style="margin-top: 30px; padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <strong>📝 Tour Notes:</strong><br>
        <span style="color: #6b7280;">${tour.remarks}</span>
      </p>
      ` : ''}
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        This is an automated reminder from TravelOps. Please ensure appropriate follow-up with the guest upon their return to Indonesia.
      </p>
    </div>
    
    <div class="footer">
      <p><strong>TravelOps</strong></p>
      <p>Travel Operations Management System</p>
      <p style="margin-top: 20px; font-size: 12px;">
        This email was sent to ${tour.staff_email} as the assigned staff member for this tour.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send ticket departure reminder email
 * @param {Object} ticket - Ticket details with segments
 * @param {number} daysUntil - Days until departure
 */
async function sendTicketDepartureReminder(ticket, daysUntil) {
  if (!isEmailConfigured || !transporter) {
    logger.warn('Email service not configured - skipping ticket departure reminder');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const subject = getTicketDepartureSubject(daysUntil, ticket.booking_code);
    const htmlContent = getTicketDepartureEmailTemplate(ticket, daysUntil);
    
    if (!ticket.staff_email) {
      logger.warn(`No staff email found for ticket ${ticket.booking_code}`);
      return { success: false, error: 'No staff email address' };
    }

    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: ticket.staff_email,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Ticket departure reminder sent for ${ticket.booking_code} (${daysUntil} days) to ${ticket.staff_email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send ticket reminder for ${ticket.booking_code}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send ticket arrival reminder email
 * @param {Object} ticket - Ticket details with segments
 */
async function sendTicketArrivalReminder(ticket) {
  if (!isEmailConfigured || !transporter) {
    logger.warn('Email service not configured - skipping ticket arrival reminder');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const subject = `🛬 Flight Arriving Today! - ${ticket.booking_code}`;
    const htmlContent = getTicketArrivalEmailTemplate(ticket);
    
    if (!ticket.staff_email) {
      logger.warn(`No staff email found for ticket ${ticket.booking_code}`);
      return { success: false, error: 'No staff email address' };
    }

    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: ticket.staff_email,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Ticket arrival reminder sent for ${ticket.booking_code} to ${ticket.staff_email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send ticket arrival reminder for ${ticket.booking_code}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate subject for ticket departure reminder
 */
function getTicketDepartureSubject(daysUntil, bookingCode) {
  if (daysUntil === 0) {
    return `✈️ Flight Departs TODAY! - ${bookingCode}`;
  } else if (daysUntil === 1) {
    return `⏰ Flight Departs TOMORROW - ${bookingCode}`;
  } else if (daysUntil === 2) {
    return `📅 Flight in 2 Days - ${bookingCode}`;
  } else if (daysUntil === 3) {
    return `📅 Flight in 3 Days - ${bookingCode}`;
  } else {
    return `📅 Flight in ${daysUntil} Days - ${bookingCode}`;
  }
}

/**
 * Generate ticket departure email template
 */
function getTicketDepartureEmailTemplate(ticket, daysUntil) {
  const segments = ticket.segments || [];
  const firstSegment = segments[0] || {};
  const lastSegment = segments[segments.length - 1] || firstSegment;
  
  const passengers = (ticket.passenger_names || '').split('\n').filter(Boolean);
  
  let urgencyColor = '#3b82f6';
  let urgencyText = '';
  
  if (daysUntil === 0) {
    urgencyColor = '#dc2626';
    urgencyText = '🛫 FLIGHT DEPARTS TODAY!';
  } else if (daysUntil === 1) {
    urgencyColor = '#f59e0b';
    urgencyText = '⏰ Flight Tomorrow!';
  } else if (daysUntil <= 3) {
    urgencyColor = '#f59e0b';
    urgencyText = `📅 ${daysUntil} Days Until Flight`;
  } else {
    urgencyText = `📅 ${daysUntil} Days Until Flight`;
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: ${urgencyColor}; color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .urgency-badge { background: ${urgencyColor}; color: white; display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin-bottom: 20px; }
    .info-card { background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid ${urgencyColor}; }
    .info-row { display: flex; margin-bottom: 12px; }
    .info-label { color: #6b7280; width: 140px; font-size: 14px; }
    .info-value { color: #1f2937; font-weight: 500; flex: 1; }
    .segment-list { margin-top: 20px; }
    .segment-item { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
    .segment-route { font-weight: 600; font-size: 16px; color: #1f2937; }
    .segment-details { color: #6b7280; font-size: 13px; margin-top: 8px; }
    .passengers-list { background: #f0fdf4; border-radius: 8px; padding: 15px; margin-top: 20px; }
    .passengers-list h3 { color: #166534; margin: 0 0 10px 0; font-size: 14px; }
    .passengers-list ul { margin: 0; padding-left: 20px; }
    .passengers-list li { color: #1f2937; margin-bottom: 5px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✈️ Flight Reminder</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">TravelOps Notification</p>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <span class="urgency-badge">${urgencyText}</span>
      </div>
      
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">Booking Code:</span>
          <span class="info-value" style="font-size: 18px; font-weight: bold;">${ticket.booking_code}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Airline:</span>
          <span class="info-value">${ticket.airline_code ? ticket.airline_code + ' - ' : ''}${ticket.airline_name || 'Not specified'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">GDS/System:</span>
          <span class="info-value">${ticket.gds_system ? ticket.gds_system.toUpperCase() : 'Not specified'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Route:</span>
          <span class="info-value">${firstSegment.origin || '?'} → ${lastSegment.destination || '?'}</span>
        </div>
      </div>
      
      <h3 style="color: #1f2937; margin-bottom: 10px;">📋 Flight Segments</h3>
      <div class="segment-list">
        ${segments.map((s, i) => `
          <div class="segment-item">
            <div class="segment-route">
              Segment ${i + 1}: ${s.origin || '?'} → ${s.destination || '?'}
              ${s.flight_number ? `<span style="color: #3b82f6; font-size: 14px;">(${s.flight_number})</span>` : ''}
            </div>
            <div class="segment-details">
              📅 Departure: ${s.departure_date || 'TBA'} ${s.departure_time || ''}
              ${s.arrival_date ? `<br>📅 Arrival: ${s.arrival_date} ${s.arrival_time || ''}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      
      ${passengers.length > 0 ? `
      <div class="passengers-list">
        <h3>👥 Passengers (${passengers.length})</h3>
        <ul>
          ${passengers.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      
      ${ticket.notes ? `
      <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin-top: 20px;">
        <h3 style="color: #d97706; margin: 0 0 10px 0; font-size: 14px;">📝 Notes</h3>
        <p style="margin: 0; color: #1f2937;">${ticket.notes}</p>
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <p><strong>TravelOps</strong></p>
      <p>Travel Operations Management System</p>
      <p style="margin-top: 15px;">This reminder was sent to ${ticket.staff_email}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate ticket arrival email template
 */
function getTicketArrivalEmailTemplate(ticket) {
  const segments = ticket.segments || [];
  const lastSegment = segments[segments.length - 1] || {};
  const passengers = (ticket.passenger_names || '').split('\n').filter(Boolean);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: #059669; color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .arrival-badge { background: #059669; color: white; display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin-bottom: 20px; }
    .info-card { background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #059669; }
    .info-row { display: flex; margin-bottom: 12px; }
    .info-label { color: #6b7280; width: 140px; font-size: 14px; }
    .info-value { color: #1f2937; font-weight: 500; flex: 1; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛬 Flight Arrival</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">TravelOps Notification</p>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <span class="arrival-badge">🛬 ARRIVING TODAY!</span>
      </div>
      
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">Booking Code:</span>
          <span class="info-value" style="font-size: 18px; font-weight: bold;">${ticket.booking_code}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Airline:</span>
          <span class="info-value">${ticket.airline_code ? ticket.airline_code + ' - ' : ''}${ticket.airline_name || 'Not specified'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Final Destination:</span>
          <span class="info-value" style="font-size: 16px; font-weight: bold;">${lastSegment.destination || '?'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Arrival Time:</span>
          <span class="info-value">${lastSegment.arrival_date || 'Today'} ${lastSegment.arrival_time || 'TBA'}</span>
        </div>
        ${lastSegment.flight_number ? `
        <div class="info-row">
          <span class="info-label">Flight Number:</span>
          <span class="info-value">${lastSegment.flight_number}</span>
        </div>
        ` : ''}
      </div>
      
      <p style="color: #166534; font-weight: 500; text-align: center;">
        ✅ Please ensure arrangements are ready for guest arrival
      </p>
      
      ${passengers.length > 0 ? `
      <div style="background: #f0fdf4; border-radius: 8px; padding: 15px; margin-top: 20px;">
        <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 14px;">👥 Arriving Passengers (${passengers.length})</h3>
        <ul style="margin: 0; padding-left: 20px;">
          ${passengers.map(p => `<li style="color: #1f2937; margin-bottom: 5px;">${p}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <p><strong>TravelOps</strong></p>
      <p>Travel Operations Management System</p>
      <p style="margin-top: 15px;">This reminder was sent to ${ticket.staff_email}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send open ticket daily reminder email
 * @param {Object} ticket - Open ticket details with segments
 */
async function sendOpenTicketReminder(ticket) {
  if (!isEmailConfigured || !transporter) {
    logger.warn('Email service not configured - skipping open ticket reminder');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const subject = `🎫 Daily Reminder: Open Ticket Pending - ${ticket.booking_code}`;
    const htmlContent = getOpenTicketEmailTemplate(ticket);
    
    if (!ticket.staff_email) {
      logger.warn(`No staff email found for open ticket ${ticket.booking_code}`);
      return { success: false, error: 'No staff email address' };
    }

    const mailOptions = {
      from: `"TravelOps Notifications" <${emailConfig.auth.user}>`,
      to: ticket.staff_email,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Open ticket reminder sent for ${ticket.booking_code} to ${ticket.staff_email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send open ticket reminder for ${ticket.booking_code}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate open ticket email template
 */
function getOpenTicketEmailTemplate(ticket) {
  const segments = ticket.segments || [];
  const firstSegment = segments[0] || {};
  const lastSegment = segments[segments.length - 1] || firstSegment;
  
  const passengers = (ticket.passenger_names || '').split('\n').filter(Boolean);
  const today = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });
  
  // Build route summary
  let routeSummary = '';
  if (segments.length > 0) {
    if (segments.length === 1) {
      routeSummary = `${firstSegment.origin || '?'} → ${firstSegment.destination || '?'}`;
    } else {
      const stops = segments.map(s => s.origin).concat([lastSegment.destination]);
      routeSummary = stops.filter(Boolean).join(' → ');
    }
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header .date { opacity: 0.9; margin-top: 8px; font-size: 14px; }
    .content { padding: 30px; }
    .open-badge { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; display: inline-block; padding: 10px 20px; border-radius: 8px; font-weight: bold; margin-bottom: 20px; border: 2px solid #f59e0b; }
    .info-card { background: #fffbeb; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #f59e0b; }
    .info-row { display: flex; margin-bottom: 12px; }
    .info-label { color: #92400e; width: 140px; font-size: 14px; }
    .info-value { color: #1f2937; font-weight: 500; flex: 1; }
    .action-box { background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; }
    .action-title { color: #92400e; font-weight: 600; font-size: 16px; margin-bottom: 10px; }
    .action-text { color: #78350f; font-size: 14px; }
    .passenger-list { background: #f8fafc; border-radius: 8px; padding: 15px; margin-top: 15px; }
    .passenger-list h4 { margin: 0 0 10px 0; color: #374151; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎫 Open Ticket Reminder</h1>
      <div class="date">${today}</div>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <span class="open-badge">OPEN TICKET - Flexible Date</span>
      </div>
      
      <div class="action-box">
        <div class="action-title">⚠️ Action Required</div>
        <div class="action-text">
          This is an open ticket with flexible travel dates.<br>
          Please follow up with the passenger to confirm their travel schedule.
        </div>
      </div>
      
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">📋 Booking Code:</span>
          <span class="info-value"><strong>${ticket.booking_code}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">✈️ Airline:</span>
          <span class="info-value">${ticket.airline_code ? `[${ticket.airline_code}] ` : ''}${ticket.airline_name || '—'}</span>
        </div>
        ${routeSummary ? `
        <div class="info-row">
          <span class="info-label">🗺️ Route:</span>
          <span class="info-value">${routeSummary}</span>
        </div>
        ` : ''}
        ${ticket.gds_system ? `
        <div class="info-row">
          <span class="info-label">💻 GDS System:</span>
          <span class="info-value">${ticket.gds_system.toUpperCase()}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">👤 Staff:</span>
          <span class="info-value">${ticket.staff_name || '—'}</span>
        </div>
      </div>
      
      ${passengers.length > 0 ? `
      <div class="passenger-list">
        <h4>👥 Passengers (${passengers.length}):</h4>
        <ul style="margin: 0; padding-left: 20px;">
          ${passengers.map(p => `<li style="color: #1f2937; margin-bottom: 5px;">${p}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      
      ${ticket.notes ? `
      <div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px;">
        <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 14px;">📝 Notes:</h4>
        <p style="margin: 0; color: #1f2937; font-size: 14px; white-space: pre-wrap;">${ticket.notes}</p>
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <p><strong>TravelOps</strong></p>
      <p>Travel Operations Management System</p>
      <p style="margin-top: 10px; color: #92400e;">
        📧 You will receive this reminder daily until the ticket is marked as Completed or Cancelled.
      </p>
      <p style="margin-top: 10px;">This reminder was sent to ${ticket.staff_email}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Check if email service is configured
 * @returns {boolean} True if email is configured
 */
function checkEmailConfigured() {
  return isEmailConfigured && transporter !== null;
}

export {
  sendDepartureReminder,
  sendCruiseReminder,
  sendReturnArrivalReminder,
  sendTestEmail,
  sendTicketDepartureReminder,
  sendTicketArrivalReminder,
  sendOpenTicketReminder,
  checkEmailConfigured
};
