const winston = require('winston');
const Entity = require('../models/Entity');
const Event = require('../models/Event');
const Alert = require('../models/Alert');
const User = require('../models/User');

// Logger setup
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info