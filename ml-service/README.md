# Campus Security ML Service

A FastAPI-based machine learning microservice for entity resolution and predictive analytics in the campus security system.

## Features

- **Entity Resolution**: Advanced similarity matching using multiple algorithms (Jaro-Winkler, Levenshtein, Jaccard, Composite)
- **Location Prediction**: Predict next likely location based on historical patterns and time context
- **Activity Prediction**: Infer current activity based on location, time, and behavioral patterns
- **Face Matching**: Match face embeddings against known entities (mock implementation)
- **Batch Processing**: Handle multiple entity resolution requests efficiently
- **Performance Analytics**: Monitor model performance and accuracy metrics

## API Endpoints

### Core Endpoints

- `GET /` - Service information and available endpoints
- `GET /health` - Detailed health check with system status
- `POST /similarity/calculate` - Calculate similarity between two entity records
- `POST /prediction/location` - Predict next location for an entity
- `POST /prediction/activity` - Predict current activity based on context
- `POST /face/match` - Match face embedding against known faces
- `POST /batch/entity-resolution` - Batch entity resolution for multiple records
- `GET /analytics/model-performance` - Get model performance metrics

## Installation

### Local Development

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run the service:**
   ```bash
   python main.py
   ```

   The service will start on `http://localhost:8001`

### Docker Deployment

1. **Build the Docker image:**
   ```bash
   docker build -t campus-security-ml .
   ```

2. **Run the container:**
   ```bash
   docker run -p 8001:8001 campus-security-ml
   ```

## Usage Examples

### Entity Similarity Calculation

```python
import requests

payload = {
    "record1": {
        "entity_id": "E100001",
        "name": "Neha Kumar",
        "email": "neha.kumar@campus.edu",
        "student_id": "S14165"
    },
    "record2": {
        "entity_id": "E100002", 
        "name": "Neha Kumari",
        "email": "neha.k@campus.edu",
        "student_id": "S14166"
    },
    "algorithm": "composite"
}

response = requests.post("http://localhost:8001/similarity/calculate", json=payload)
print(response.json())
```

### Location Prediction

```python
payload = {
    "entity_id": "E100001",
    "current_time": "2024-01-15T14:30:00Z",
    "historical_data": [
        {"location": "LIBRARY", "timestamp": "2024-01-15T09:00:00Z"},
        {"location": "ACADEMIC_COMPLEX", "timestamp": "2024-01-15T11:00:00Z"}
    ]
}

response = requests.post("http://localhost:8001/prediction/location", json=payload)
print(response.json())
```

### Activity Prediction

```python
payload = {
    "entity_id": "E100001",
    "current_time": "2024-01-15T14:30:00Z",
    "location": "LIBRARY",
    "historical_patterns": []
}

response = requests.post("http://localhost:8001/prediction/activity", json=payload)
print(response.json())
```

## Testing

Run the test suite to verify all endpoints:

```bash
python test_service.py
```

This will test all major functionality including:
- Health checks
- Similarity calculations
- Location and activity predictions
- Face matching
- Batch processing
- Performance metrics

## Configuration

Key configuration options in `.env`:

- `ML_SERVICE_HOST`: Service host (default: 0.0.0.0)
- `ML_SERVICE_PORT`: Service port (default: 8001)
- `SIMILARITY_THRESHOLD`: Minimum similarity score for matches (default: 0.8)
- `FACE_MATCH_THRESHOLD`: Minimum confidence for face matches (default: 0.85)
- `LOG_LEVEL`: Logging level (default: INFO)

## Model Details

### Similarity Algorithms

1. **Jaro-Winkler**: Best for names and short strings with common prefixes
2. **Levenshtein**: Good for strings with character-level differences
3. **Jaccard**: Effective for comparing sets of tokens or n-grams
4. **Composite**: Weighted combination of multiple fields and algorithms

### Prediction Models

- **Location Predictor**: Rule-based model using time patterns and historical data
- **Activity Predictor**: Context-aware model considering location, time, and patterns
- **Face Matcher**: Cosine similarity on face embeddings (mock implementation)

### Performance Metrics

The service tracks and reports:
- Accuracy, Precision, Recall, F1-Score for each model
- False positive/negative rates for face matching
- Processing times and throughput
- Model freshness and last training dates

## Integration

This ML service integrates with the main campus security backend through:

1. **REST API calls** for real-time predictions
2. **Batch processing** for bulk entity resolution
3. **Performance monitoring** for model health
4. **Explainable AI** features for audit trails

## Development

### Adding New Models

1. Implement model class in `main.py`
2. Add model to `MLService.load_models()`
3. Create corresponding API endpoint
4. Add tests in `test_service.py`
5. Update documentation

### Model Training

For production deployment:
1. Replace mock models with trained XGBoost/LSTM models
2. Implement model persistence and loading
3. Add model retraining pipelines
4. Set up model versioning and A/B testing

## Security Considerations

- Input validation on all endpoints
- Rate limiting for API calls
- Secure model storage and access
- Audit logging for all predictions
- Privacy-preserving techniques for sensitive data

## Monitoring

The service provides built-in monitoring through:
- Health check endpoints
- Performance metrics API
- Structured logging
- Error tracking and alerting

## License

Part of the Campus Security System project.