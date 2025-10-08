#!/bin/bash

# Campus Security System - Service Startup Script
echo "🚀 Starting Campus Security System Services..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}Waiting for $service_name to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is ready!${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Attempt $attempt/$max_attempts - $service_name not ready yet...${NC}"
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start within expected time${NC}"
    return 1
}

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed. Please install Python 3 first.${NC}"
    exit 1
fi

# Check if MongoDB is running
if ! check_port 27017; then
    echo -e "${RED}❌ MongoDB is not running. Please start MongoDB first.${NC}"
    exit 1
fi

# Check if Redis is running
if ! check_port 6379; then
    echo -e "${RED}❌ Redis is not running. Please start Redis first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites are met${NC}"

# Kill existing processes on our ports
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
if check_port 8001; then
    echo "Killing process on port 8001..."
    lsof -ti:8001 | xargs kill -9 2>/dev/null || true
fi

if check_port 5000; then
    echo "Killing process on port 5000..."
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
fi

# Start ML Service
echo -e "${BLUE}🤖 Starting ML Service...${NC}"
cd ml-service

# Install Python dependencies if needed
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt > /dev/null 2>&1

# Start ML service in background
python main.py > ../logs/ml-service.log 2>&1 &
ML_PID=$!
echo -e "${GREEN}✅ ML Service started (PID: $ML_PID)${NC}"

cd ..

# Wait for ML service to be ready
wait_for_service "http://localhost:8001/health" "ML Service"

# Start Backend Service
echo -e "${BLUE}🔧 Starting Backend Service...${NC}"
cd backend

# Install Node.js dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install > /dev/null 2>&1
fi

# Start backend service in background
npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend Service started (PID: $BACKEND_PID)${NC}"

cd ..

# Wait for backend service to be ready
wait_for_service "http://localhost:5000/api/health" "Backend Service"

# Create logs directory if it doesn't exist
mkdir -p logs

# Save PIDs for cleanup
echo $ML_PID > logs/ml-service.pid
echo $BACKEND_PID > logs/backend.pid

echo -e "${GREEN}🎉 All services are running successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
echo -e "  🤖 ML Service:      http://localhost:8001"
echo -e "  🔧 Backend API:     http://localhost:5000"
echo -e "  📚 API Docs:        http://localhost:5000/api-docs"
echo -e "  🤖 ML Service Docs: http://localhost:8001/docs"
echo ""
echo -e "${YELLOW}📝 Logs:${NC}"
echo -e "  ML Service:  tail -f logs/ml-service.log"
echo -e "  Backend:     tail -f logs/backend.log"
echo ""
echo -e "${YELLOW}🛑 To stop services:${NC}"
echo -e "  ./stop-services.sh"
echo ""
echo -e "${GREEN}✨ System is ready for use!${NC}"

# Keep script running to monitor services
trap 'echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"; kill $ML_PID $BACKEND_PID 2>/dev/null; exit 0' INT

# Monitor services
while true; do
    if ! kill -0 $ML_PID 2>/dev/null; then
        echo -e "${RED}❌ ML Service has stopped unexpectedly${NC}"
        break
    fi
    
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}❌ Backend Service has stopped unexpectedly${NC}"
        break
    fi
    
    sleep 5
done