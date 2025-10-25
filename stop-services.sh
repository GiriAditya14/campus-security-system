#!/bin/bash

# Campus Security System - Service Shutdown Script
echo "🛑 Stopping Campus Security System Services..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to kill process by PID file
kill_by_pid_file() {
    local pid_file=$1
    local service_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Stopping $service_name (PID: $pid)...${NC}"
            kill "$pid"
            
            # Wait for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                ((count++))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${YELLOW}Force killing $service_name...${NC}"
                kill -9 "$pid" 2>/dev/null
            fi
            
            echo -e "${GREEN}✅ $service_name stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  $service_name was not running${NC}"
        fi
        
        rm -f "$pid_file"
    else
        echo -e "${YELLOW}⚠️  No PID file found for $service_name${NC}"
    fi
}

# Function to kill processes by port
kill_by_port() {
    local port=$1
    local service_name=$2
    
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}Killing processes on port $port ($service_name)...${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null
        echo -e "${GREEN}✅ Processes on port $port stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  No processes found on port $port${NC}"
    fi
}

# Create logs directory if it doesn't exist
mkdir -p logs

# Stop services using PID files
echo -e "${YELLOW}🔍 Stopping services using PID files...${NC}"
kill_by_pid_file "logs/ml-service.pid" "ML Service"
kill_by_pid_file "logs/backend.pid" "Backend Service"

# Fallback: Stop services by port
echo -e "${YELLOW}🔍 Checking for remaining processes on service ports...${NC}"
kill_by_port 8001 "ML Service"
kill_by_port 5000 "Backend Service"

# Clean up log files (optional)
read -p "Do you want to clear log files? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🧹 Clearing log files...${NC}"
    rm -f logs/ml-service.log
    rm -f logs/backend.log
    echo -e "${GREEN}✅ Log files cleared${NC}"
fi

echo -e "${GREEN}🎉 All services have been stopped successfully!${NC}"
echo ""
echo -e "${YELLOW}📝 To restart services:${NC}"
echo -e "  ./start-services.sh"