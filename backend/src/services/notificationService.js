const winston = require('winston');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { Server } = require('socket.io');

// Logger setup
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/notification.log' })
    ]
});

/**
 * Notification Service
 * Handles multi-channel notifications: WebSocket, Email, SMS, Webhook
 */
class NotificationService {
    constructor(httpServer = null) {
        this.httpServer = httpServer;
        
        this.config = {
            // Email configuration
            emailHost: process.env.EMAIL_HOST || 'smtp.gmail.com',
            emailPort: parseInt(process.env.EMAIL_PORT) || 587,
            emailUser: process.env.EMAIL_USER,
            emailPass: process.env.EMAIL_PASS,
            emailFrom: process.env.EMAIL_FROM || 'Campus Security <security@campus.edu>',
            
            // SMS configuration (Twilio)
            twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
            twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
            twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
            
            // Webhook configuration
            webhookSecret: process.env.WEBHOOK_SECRET,
            webhookRetries: 3,
            webhookTimeout: 10000,
            
            // WebSocket configuration
            corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
            
            // Rate limiting
            maxEmailsPerHour: 100,
            maxSMSPerHour: 50,
            maxWebhooksPerMinute: 60
        };

        // Initialize notification channels
        this.channels = {
            websocket: null,
            email: null,
            sms: null,
            webhook: null
        };

        // Notification templates
        this.templates = {
            email: {
                INACTIVITY: {
                    subject: 'Campus Security Alert: Entity Inactivity Detected',
                    template: 'inactivity_alert'
                },
                UNUSUAL_LOCATION: {
                    subject: 'Campus Security Alert: Unusual Location Access',
                    template: 'unusual_location_alert'
                },
                MULTIPLE_PRESENCE: {
                    subject: 'CRITICAL: Multiple Presence Detected',
                    template: 'multiple_presence_alert'
                },
                PATTERN_ANOMALY: {
                    subject: 'Campus Security Alert: Behavioral Anomaly',
                    template: 'pattern_anomaly_alert'
                },
                SECURITY_BREACH: {
                    subject: 'CRITICAL SECURITY BREACH DETECTED',
                    template: 'security_breach_alert'
                }
            },
            sms: {
                INACTIVITY: 'Campus Alert: {entity_name} inactive for {hours} hours. Last seen: {location}',
                UNUSUAL_LOCATION: 'SECURITY ALERT: {entity_name} detected in restricted area: {location}',
                MULTIPLE_PRESENCE: 'CRITICAL: {entity_name} detected at multiple locations simultaneously',
                PATTERN_ANOMALY: 'Campus Alert: Unusual behavior detected for {entity_name}',
                SECURITY_BREACH: 'CRITICAL SECURITY BREACH: Immediate attention required'
            }
        };

        // Rate limiting tracking
        this.rateLimits = {
            email: new Map(),
            sms: new Map(),
            webhook: new Map()
        };

        // Notification queue for retry logic
        this.notificationQueue = [];
        this.isProcessingQueue = false;

        // Performance metrics
        this.metrics = {
            totalNotifications: 0,
            successfulNotifications: 0,
            failedNotifications: 0,
            notificationsByChannel: {
                websocket: 0,
                email: 0,
                sms: 0,
                webhook: 0
            },
            avgDeliveryTime: 0,
            lastNotificationTime: null
        };

        // Initialize notification channels
        this.initializeChannels();
        
        // Start queue processor
        this.startQueueProcessor();
    }    /*
*
     * Initialize notification channels
     */
    async initializeChannels() {
        try {
            // Initialize WebSocket server
            if (this.httpServer) {
                this.channels.websocket = new Server(this.httpServer, {
                    cors: {
                        origin: this.config.corsOrigin,
                        methods: ['GET', 'POST']
                    },
                    path: '/socket.io'
                });

                this.setupWebSocketHandlers();
                logger.info('WebSocket notification channel initialized');
            }

            // Initialize email transporter
            if (this.config.emailUser && 
                this.config.emailPass && 
                !this.config.emailUser.includes('your-email') && 
                !this.config.emailPass.includes('your-app-password')) {
                
                try {
                    this.channels.email = nodemailer.createTransport({
                        host: this.config.emailHost,
                        port: this.config.emailPort,
                        secure: this.config.emailPort === 465,
                        auth: {
                            user: this.config.emailUser,
                            pass: this.config.emailPass
                        },
                        pool: true,
                        maxConnections: 5,
                        maxMessages: 100
                    });

                    // Verify email configuration
                    await this.channels.email.verify();
                    logger.info('✅ Email notification channel initialized');
                } catch (error) {
                    logger.warn('⚠️  Email configuration invalid:', error.message);
                    logger.info('📝 Email notifications disabled - check credentials');
                    this.channels.email = null;
                }
            } else {
                logger.info('📝 Email notifications disabled - no valid credentials configured');
            }

            // Initialize SMS (Twilio)
            if (this.config.twilioAccountSid && this.config.twilioAuthToken) {
                this.channels.sms = {
                    accountSid: this.config.twilioAccountSid,
                    authToken: this.config.twilioAuthToken,
                    fromNumber: this.config.twilioPhoneNumber
                };
                logger.info('SMS notification channel initialized');
            }

            // Initialize webhook client
            this.channels.webhook = axios.create({
                timeout: this.config.webhookTimeout,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Campus-Security-System/1.0'
                }
            });
            logger.info('Webhook notification channel initialized');

        } catch (error) {
            logger.error('Error initializing notification channels:', error);
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers() {
        this.channels.websocket.on('connection', (socket) => {
            logger.debug(`WebSocket client connected: ${socket.id}`);

            // Handle authentication
            socket.on('authenticate', (token) => {
                // Verify JWT token and set user context
                // Implementation would verify the token and set socket.user
                socket.authenticated = true;
                socket.emit('authenticated', { status: 'success' });
            });

            // Handle subscription to specific alert types
            socket.on('subscribe', (alertTypes) => {
                if (socket.authenticated) {
                    socket.alertSubscriptions = alertTypes;
                    socket.emit('subscribed', { alertTypes });
                }
            });

            socket.on('disconnect', () => {
                logger.debug(`WebSocket client disconnected: ${socket.id}`);
            });
        });
    }

    /**
     * Send notification through multiple channels
     */
    async sendNotification(alert, channels = ['websocket'], recipients = {}) {
        const startTime = Date.now();
        
        try {
            logger.info(`Sending notification for alert ${alert._id}`, {
                type: alert.type,
                severity: alert.severity,
                channels
            });

            const results = {};
            const promises = [];

            // Send through each requested channel
            for (const channel of channels) {
                switch (channel) {
                    case 'websocket':
                        promises.push(this.sendWebSocketNotification(alert));
                        break;
                    case 'email':
                        if (recipients.email) {
                            promises.push(this.sendEmailNotification(alert, recipients.email));
                        }
                        break;
                    case 'sms':
                        if (recipients.sms) {
                            promises.push(this.sendSMSNotification(alert, recipients.sms));
                        }
                        break;
                    case 'webhook':
                        if (recipients.webhook) {
                            promises.push(this.sendWebhookNotification(alert, recipients.webhook));
                        }
                        break;
                    default:
                        logger.warn(`Unknown notification channel: ${channel}`);
                }
            }

            // Wait for all notifications to complete
            const channelResults = await Promise.allSettled(promises);
            
            // Process results
            channels.forEach((channel, index) => {
                const result = channelResults[index];
                results[channel] = {
                    success: result.status === 'fulfilled',
                    error: result.status === 'rejected' ? result.reason.message : null,
                    data: result.status === 'fulfilled' ? result.value : null
                };
            });

            // Update metrics
            const deliveryTime = Date.now() - startTime;
            this.updateMetrics(channels, results, deliveryTime);

            logger.info(`Notification sent for alert ${alert._id}`, {
                deliveryTime,
                results: Object.fromEntries(
                    Object.entries(results).map(([channel, result]) => [channel, result.success])
                )
            });

            return results;

        } catch (error) {
            logger.error(`Notification failed for alert ${alert._id}:`, error);
            throw error;
        }
    }

    /**
     * Send WebSocket notification
     */
    async sendWebSocketNotification(alert) {
        try {
            if (!this.channels.websocket) {
                throw new Error('WebSocket channel not initialized');
            }

            const notification = {
                id: alert._id,
                type: alert.type,
                severity: alert.severity,
                title: alert.title,
                description: alert.description,
                timestamp: alert.triggered_at || new Date(),
                context: alert.context,
                auto_resolve: alert.auto_resolve
            };

            // Broadcast to all authenticated clients
            this.channels.websocket.emit('alert', notification);

            // Also send to clients subscribed to this alert type
            this.channels.websocket.sockets.sockets.forEach(socket => {
                if (socket.authenticated && 
                    socket.alertSubscriptions && 
                    socket.alertSubscriptions.includes(alert.type)) {
                    socket.emit('targeted_alert', notification);
                }
            });

            this.metrics.notificationsByChannel.websocket++;
            return { success: true, clientCount: this.channels.websocket.sockets.sockets.size };

        } catch (error) {
            logger.error('WebSocket notification failed:', error);
            throw error;
        }
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(alert, recipients) {
        try {
            if (!this.channels.email) {
                throw new Error('Email channel not initialized');
            }

            // Check rate limits
            if (!this.checkRateLimit('email', recipients.length)) {
                throw new Error('Email rate limit exceeded');
            }

            const template = this.templates.email[alert.type];
            if (!template) {
                throw new Error(`No email template found for alert type: ${alert.type}`);
            }

            // Generate email content
            const emailContent = await this.generateEmailContent(alert, template);
            
            // Prepare email options
            const mailOptions = {
                from: this.config.emailFrom,
                to: Array.isArray(recipients) ? recipients.join(', ') : recipients,
                subject: template.subject,
                html: emailContent.html,
                text: emailContent.text,
                priority: alert.severity === 'CRITICAL' ? 'high' : 'normal'
            };

            // Send email
            const result = await this.channels.email.sendMail(mailOptions);
            
            this.metrics.notificationsByChannel.email++;
            return { 
                success: true, 
                messageId: result.messageId,
                recipients: Array.isArray(recipients) ? recipients.length : 1
            };

        } catch (error) {
            logger.error('Email notification failed:', error);
            throw error;
        }
    }

    /**
     * Send SMS notification
     */
    async sendSMSNotification(alert, recipients) {
        try {
            if (!this.channels.sms) {
                throw new Error('SMS channel not initialized');
            }

            // Check rate limits
            if (!this.checkRateLimit('sms', recipients.length)) {
                throw new Error('SMS rate limit exceeded');
            }

            const template = this.templates.sms[alert.type];
            if (!template) {
                throw new Error(`No SMS template found for alert type: ${alert.type}`);
            }

            // Generate SMS content
            const smsContent = this.generateSMSContent(alert, template);
            
            const results = [];
            const recipientList = Array.isArray(recipients) ? recipients : [recipients];

            // Send SMS to each recipient
            for (const phoneNumber of recipientList) {
                try {
                    const response = await axios.post(
                        `https://api.twilio.com/2010-04-01/Accounts/${this.channels.sms.accountSid}/Messages.json`,
                        new URLSearchParams({
                            From: this.channels.sms.fromNumber,
                            To: phoneNumber,
                            Body: smsContent
                        }),
                        {
                            auth: {
                                username: this.channels.sms.accountSid,
                                password: this.channels.sms.authToken
                            },
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            }
                        }
                    );

                    results.push({
                        phoneNumber,
                        success: true,
                        sid: response.data.sid
                    });

                } catch (error) {
                    results.push({
                        phoneNumber,
                        success: false,
                        error: error.message
                    });
                }
            }

            this.metrics.notificationsByChannel.sms += results.filter(r => r.success).length;
            return { 
                success: results.some(r => r.success),
                results,
                totalSent: results.filter(r => r.success).length
            };

        } catch (error) {
            logger.error('SMS notification failed:', error);
            throw error;
        }
    }

    /**
     * Send webhook notification
     */
    async sendWebhookNotification(alert, webhookUrls) {
        try {
            if (!this.channels.webhook) {
                throw new Error('Webhook channel not initialized');
            }

            // Check rate limits
            if (!this.checkRateLimit('webhook', webhookUrls.length)) {
                throw new Error('Webhook rate limit exceeded');
            }

            const payload = {
                alert_id: alert._id,
                type: alert.type,
                severity: alert.severity,
                title: alert.title,
                description: alert.description,
                timestamp: alert.triggered_at || new Date(),
                context: alert.context,
                signature: this.generateWebhookSignature(alert)
            };

            const results = [];
            const urlList = Array.isArray(webhookUrls) ? webhookUrls : [webhookUrls];

            // Send webhook to each URL
            for (const url of urlList) {
                try {
                    const response = await this.channels.webhook.post(url, payload, {
                        headers: {
                            'X-Campus-Security-Signature': payload.signature,
                            'X-Campus-Security-Event': alert.type
                        }
                    });

                    results.push({
                        url,
                        success: true,
                        status: response.status,
                        responseTime: response.headers['x-response-time']
                    });

                } catch (error) {
                    results.push({
                        url,
                        success: false,
                        error: error.message,
                        status: error.response?.status
                    });
                }
            }

            this.metrics.notificationsByChannel.webhook += results.filter(r => r.success).length;
            return { 
                success: results.some(r => r.success),
                results,
                totalSent: results.filter(r => r.success).length
            };

        } catch (error) {
            logger.error('Webhook notification failed:', error);
            throw error;
        }
    }

    /**
     * Generate email content from template
     */
    async generateEmailContent(alert, template) {
        try {
            // In a real implementation, this would use a template engine like Handlebars
            // For now, we'll generate simple HTML content
            
            const context = alert.context || {};
            const entityName = context.entity_name || 'Unknown Entity';
            const timestamp = new Date(alert.triggered_at || Date.now()).toLocaleString();

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${alert.title}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { text-align: center; margin-bottom: 30px; }
                        .alert-${alert.severity.toLowerCase()} { border-left: 4px solid ${this.getSeverityColor(alert.severity)}; padding-left: 15px; }
                        .severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; font-weight: bold; background-color: ${this.getSeverityColor(alert.severity)}; }
                        .details { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Campus Security Alert</h1>
                            <span class="severity">${alert.severity}</span>
                        </div>
                        
                        <div class="alert-${alert.severity.toLowerCase()}">
                            <h2>${alert.title}</h2>
                            <p><strong>Description:</strong> ${alert.description}</p>
                            <p><strong>Entity:</strong> ${entityName}</p>
                            <p><strong>Time:</strong> ${timestamp}</p>
                        </div>
                        
                        ${context.location ? `
                        <div class="details">
                            <h3>Location Details</h3>
                            <p><strong>Building:</strong> ${context.location.building || 'Unknown'}</p>
                            <p><strong>Room:</strong> ${context.location.room || 'Unknown'}</p>
                            <p><strong>Access Level:</strong> ${context.location.access_level || 'Unknown'}</p>
                        </div>
                        ` : ''}
                        
                        ${context.anomaly_score ? `
                        <div class="details">
                            <h3>Anomaly Details</h3>
                            <p><strong>Anomaly Score:</strong> ${(context.anomaly_score * 100).toFixed(1)}%</p>
                            <p><strong>Risk Level:</strong> ${context.risk_level || 'Unknown'}</p>
                        </div>
                        ` : ''}
                        
                        <div class="footer">
                            <p>This is an automated alert from the Campus Security System.</p>
                            <p>Alert ID: ${alert._id}</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            const text = `
Campus Security Alert - ${alert.severity}

${alert.title}

Description: ${alert.description}
Entity: ${entityName}
Time: ${timestamp}

${context.location ? `
Location:
- Building: ${context.location.building || 'Unknown'}
- Room: ${context.location.room || 'Unknown'}
- Access Level: ${context.location.access_level || 'Unknown'}
` : ''}

Alert ID: ${alert._id}

This is an automated alert from the Campus Security System.
            `;

            return { html, text };

        } catch (error) {
            logger.error('Error generating email content:', error);
            throw error;
        }
    }

    /**
     * Generate SMS content from template
     */
    generateSMSContent(alert, template) {
        try {
            const context = alert.context || {};
            
            let content = template;
            
            // Replace placeholders
            content = content.replace('{entity_name}', context.entity_name || 'Unknown');
            content = content.replace('{hours}', context.hours_inactive || 'Unknown');
            content = content.replace('{location}', 
                context.location ? `${context.location.building}, ${context.location.room}` : 'Unknown'
            );

            // Truncate to SMS length limit (160 characters)
            if (content.length > 160) {
                content = content.substring(0, 157) + '...';
            }

            return content;

        } catch (error) {
            logger.error('Error generating SMS content:', error);
            return `Campus Security Alert: ${alert.type} - ${alert.severity}`;
        }
    }

    /**
     * Generate webhook signature for security
     */
    generateWebhookSignature(alert) {
        try {
            const crypto = require('crypto');
            const payload = JSON.stringify({
                alert_id: alert._id,
                type: alert.type,
                timestamp: alert.triggered_at
            });
            
            return crypto
                .createHmac('sha256', this.config.webhookSecret || 'default-secret')
                .update(payload)
                .digest('hex');

        } catch (error) {
            logger.error('Error generating webhook signature:', error);
            return 'invalid-signature';
        }
    }

    /**
     * Check rate limits for notification channels
     */
    checkRateLimit(channel, count = 1) {
        const now = Date.now();
        const windowMs = channel === 'webhook' ? 60 * 1000 : 60 * 60 * 1000; // 1 min for webhook, 1 hour for others
        const limits = {
            email: this.config.maxEmailsPerHour,
            sms: this.config.maxSMSPerHour,
            webhook: this.config.maxWebhooksPerMinute
        };

        const limit = limits[channel];
        if (!limit) return true;

        const rateLimitData = this.rateLimits[channel];
        
        // Clean old entries
        for (const [key, timestamp] of rateLimitData.entries()) {
            if (now - timestamp > windowMs) {
                rateLimitData.delete(key);
            }
        }

        // Check current count
        const currentCount = rateLimitData.size;
        if (currentCount + count > limit) {
            return false;
        }

        // Add new entries
        for (let i = 0; i < count; i++) {
            rateLimitData.set(`${now}_${i}`, now);
        }

        return true;
    }

    /**
     * Start notification queue processor
     */
    startQueueProcessor() {
        setInterval(() => {
            if (!this.isProcessingQueue && this.notificationQueue.length > 0) {
                this.processNotificationQueue();
            }
        }, 5000); // Process every 5 seconds
    }

    /**
     * Process notification queue for retries
     */
    async processNotificationQueue() {
        if (this.isProcessingQueue) return;
        
        this.isProcessingQueue = true;
        
        try {
            const batch = this.notificationQueue.splice(0, 10); // Process 10 at a time
            
            for (const notification of batch) {
                try {
                    await this.sendNotification(
                        notification.alert,
                        notification.channels,
                        notification.recipients
                    );
                } catch (error) {
                    // If still failing and retries left, add back to queue
                    if (notification.retries > 0) {
                        notification.retries--;
                        this.notificationQueue.push(notification);
                    } else {
                        logger.error('Notification permanently failed after retries:', error);
                    }
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    // Utility methods
    getSeverityColor(severity) {
        const colors = {
            'LOW': '#28a745',
            'MEDIUM': '#ffc107',
            'HIGH': '#fd7e14',
            'CRITICAL': '#dc3545'
        };
        return colors[severity] || '#6c757d';
    }

    updateMetrics(channels, results, deliveryTime) {
        this.metrics.totalNotifications++;
        
        const successCount = Object.values(results).filter(r => r.success).length;
        if (successCount > 0) {
            this.metrics.successfulNotifications++;
        } else {
            this.metrics.failedNotifications++;
        }

        this.metrics.avgDeliveryTime = (this.metrics.avgDeliveryTime + deliveryTime) / 2;
        this.metrics.lastNotificationTime = new Date();
    }

    /**
     * Broadcast alert to WebSocket clients
     */
    broadcastAlert(alert) {
        if (this.channels.websocket) {
            this.sendWebSocketNotification(alert).catch(error => {
                logger.error('WebSocket broadcast failed:', error);
            });
        }
    }

    /**
     * Get notification metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            queueSize: this.notificationQueue.length,
            connectedClients: this.channels.websocket ? this.channels.websocket.sockets.sockets.size : 0,
            rateLimitStatus: {
                email: this.rateLimits.email.size,
                sms: this.rateLimits.sms.size,
                webhook: this.rateLimits.webhook.size
            }
        };
    }

    /**
     * Test notification channels
     */
    async testChannels() {
        const results = {};
        
        // Test WebSocket
        if (this.channels.websocket) {
            results.websocket = { available: true, clients: this.channels.websocket.sockets.sockets.size };
        } else {
            results.websocket = { available: false };
        }

        // Test Email
        if (this.channels.email) {
            try {
                await this.channels.email.verify();
                results.email = { available: true };
            } catch (error) {
                results.email = { available: false, error: error.message };
            }
        } else {
            results.email = { available: false, error: 'Not configured' };
        }

        // Test SMS
        results.sms = { 
            available: !!(this.channels.sms?.accountSid && this.channels.sms?.authToken)
        };

        // Test Webhook
        results.webhook = { available: !!this.channels.webhook };

        return results;
    }
}

module.exports = NotificationService;