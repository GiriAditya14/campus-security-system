# Deployment Guide

## Quick Start (Recommended)

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- MongoDB 6.0+
- Redis 7.0+

### 1. Clone and Setup
```bash
git clone <repository-url>
cd campus-security-system
npm install
```

### 2. Install Dependencies
```bash
# Backend
cd backend && npm install && cd ..

# Frontend  
cd frontend && npm install && cd ..

# ML Service
cd ml-service && pip install -r requirements.txt && cd ..
```

### 3. Configure Environment
```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ml-service/.env.example ml-service/.env

# Edit configuration as needed
```

### 4. Start Services
```bash
# Option 1: Start all services
npm run start:all

# Option 2: Start individually
npm run start:backend    # Port 5000
npm run start:frontend   # Port 3000  
npm run start:ml        # Port 8001
```

### 5. Initialize Data
```bash
# Create demo users
cd backend && npm run seed:users

# Generate sample data (optional)
cd backend && npm run seed:data
```

### 6. Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **ML Service**: http://localhost:8001
- **API Docs**: http://localhost:5000/api-docs

## Docker Deployment

### Using Docker Compose
```bash
# Start all services with Docker
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Production Deployment

### Environment Variables
```bash
# Backend (.env)
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/campus_security
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secure-jwt-secret
ML_SERVICE_URL=http://localhost:8001

# Frontend (.env)
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_WS_URL=ws://localhost:5000

# ML Service (.env)
ENVIRONMENT=production
API_HOST=0.0.0.0
API_PORT=8001
```

### Performance Tuning
```bash
# MongoDB optimization
mongod --wiredTigerCacheSizeGB=2

# Redis optimization  
redis-server --maxmemory 1gb --maxmemory-policy allkeys-lru

# Node.js optimization
NODE_OPTIONS="--max-old-space-size=4096"
```

## Monitoring Setup

### Health Checks
```bash
# Check service health
curl http://localhost:5000/health
curl http://localhost:8001/health

# Check database connections
npm run check:db
```

### Logs Location
- Backend: `backend/logs/`
- Frontend: Browser console
- ML Service: `ml-service/logs/`

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check port usage
netstat -tulpn | grep :5000
netstat -tulpn | grep :3000
netstat -tulpn | grep :8001
```

**Database connection:**
```bash
# Test MongoDB
mongosh mongodb://localhost:27017/campus_security

# Test Redis
redis-cli ping
```

**Permission issues:**
```bash
# Fix file permissions
chmod +x start-services.sh
chmod +x stop-services.sh
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@campus.edu | admin123 |
| Security Officer | security@campus.edu | security123 |
| Operator | operator@campus.edu | operator123 |
| Viewer | viewer@campus.edu | viewer123 |