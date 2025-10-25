#!/usr/bin/env python3
"""
Test script for Campus Security ML Service
"""

import requests
import json
from datetime import datetime, timedelta

# Service URL
BASE_URL = "http://localhost:8001"

def test_health_check():
    """Test health check endpoint"""
    print("Testing health check...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()

def test_similarity_calculation():
    """Test entity similarity calculation"""
    print("Testing similarity calculation...")
    
    # Test data
    record1 = {
        "entity_id": "E100001",
        "name": "Neha Kumar",
        "email": "neha.kumar@campus.edu",
        "phone": "+91-9876543210",
        "student_id": "S14165",
        "card_id": "C1488"
    }
    
    record2 = {
        "entity_id": "E100002", 
        "name": "Neha Kumari",  # Similar name
        "email": "neha.k@campus.edu",  # Similar email
        "phone": "+919876543210",  # Same phone, different format
        "student_id": "S14166",  # Different student ID
        "card_id": "C1489"  # Different card ID
    }
    
    payload = {
        "record1": record1,
        "record2": record2,
        "algorithm": "composite"
    }
    
    response = requests.post(f"{BASE_URL}/similarity/calculate", json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()

def test_location_prediction():
    """Test location prediction"""
    print("Testing location prediction...")
    
    # Mock historical data
    historical_data = [
        {"location": "LIBRARY", "timestamp": "2024-01-15T09:00:00Z"},
        {"location": "ACADEMIC_COMPLEX", "timestamp": "2024-01-15T11:00:00Z"},
        {"location": "CAFETERIA", "timestamp": "2024-01-15T13:00:00Z"},
        {"location": "LIBRARY", "timestamp": "2024-01-15T15:00:00Z"}
    ]
    
    payload = {
        "entity_id": "E100001",
        "current_time": datetime.now().isoformat(),
        "historical_data": historical_data
    }
    
    response = requests.post(f"{BASE_URL}/prediction/location", json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()

def test_activity_prediction():
    """Test activity prediction"""
    print("Testing activity prediction...")
    
    payload = {
        "entity_id": "E100001",
        "current_time": datetime.now().isoformat(),
        "location": "LIBRARY",
        "historical_patterns": [
            {"activity": "study_session", "frequency": 0.6},
            {"activity": "research", "frequency": 0.3}
        ]
    }
    
    response = requests.post(f"{BASE_URL}/prediction/activity", json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()

def test_face_matching():
    """Test face matching"""
    print("Testing face matching...")
    
    # Mock face embedding (512-dimensional vector)
    mock_embedding = [0.1] * 512
    
    payload = {
        "face_embedding": mock_embedding,
        "threshold": 0.8
    }
    
    response = requests.post(f"{BASE_URL}/face/match", json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()

def test_batch_entity_resolution():
    """Test batch entity resolution"""
    print("Testing batch entity resolution...")
    
    entities = [
        {
            "entity_id": "E100001",
            "name": "Neha Kumar",
            "email": "neha.kumar@campus.edu",
            "student_id": "S14165"
        },
        {
            "entity_id": "E100002",
            "name": "Neha Kumari", 
            "email": "neha.k@campus.edu",
            "student_id": "S14166"
        },
        {
            "entity_id": "E100003",
            "name": "Ishaan Desai",
            "email": "ishaan.desai@campus.edu", 
            "student_id": "S46463"
        }
    ]
    
    response = requests.post(f"{BASE_URL}/batch/entity-resolution", json=entities)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()

def test_model_performance():
    """Test model performance endpoint"""
    print("Testing model performance...")
    
    response = requests.get(f"{BASE_URL}/analytics/model-performance")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()

if __name__ == "__main__":
    print("🧪 Campus Security ML Service Test Suite")
    print("=" * 50)
    
    try:
        # Run all tests
        test_health_check()
        test_similarity_calculation()
        test_location_prediction()
        test_activity_prediction()
        test_face_matching()
        test_batch_entity_resolution()
        test_model_performance()
        
        print("✅ All tests completed!")
        
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to ML service.")
        print("Make sure the service is running on http://localhost:8001")
        print("Run: python main.py")
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")