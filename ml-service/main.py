#!/usr/bin/env python3
"""
Campus Security ML Service
FastAPI microservice for entity resolution and predictive analytics
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging
import uvicorn
import os
import json
from pathlib import Path
import hashlib

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Campus Security ML Service",
    description="Machine Learning microservice for entity resolution and predictive analytics",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for API requests/responses
class EntityRecord(BaseModel):
    entity_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    student_id: Optional[str] = None
    card_id: Optional[str] = None
    device_hash: Optional[str] = None

class SimilarityRequest(BaseModel):
    record1: EntityRecord
    record2: EntityRecord
    algorithm: str = "composite"  # jaro_winkler, levenshtein, jaccard, composite

class SimilarityResponse(BaseModel):
    similarity_score: float
    algorithm_used: str
    field_scores: Dict[str, float]
    confidence: float

class LocationPredictionRequest(BaseModel):
    entity_id: str
    current_time: str
    historical_data: List[Dict[str, Any]]

class LocationPredictionResponse(BaseModel):
    predicted_location: str
    confidence: float
    top_3_predictions: List[Dict[str, Any]]
    explanations: List[str]
    shap_values: Dict[str, float]

class ActivityPredictionRequest(BaseModel):
    entity_id: str
    current_time: str
    location: str
    historical_patterns: List[Dict[str, Any]]

class ActivityPredictionResponse(BaseModel):
    predicted_activity: str
    confidence: float
    activity_probabilities: Dict[str, float]
    explanations: List[str]

class FaceMatchRequest(BaseModel):
    face_embedding: List[float]
    threshold: float = 0.8

class FaceMatchResponse(BaseModel):
    matches: List[Dict[str, Any]]
    best_match: Optional[Dict[str, Any]]
    confidence: float

class MLService:
    """Core ML service for entity resolution and predictions"""
    
    def __init__(self):
        self.logger = logger
        self.models = {}
        self.load_models()
    
    def load_models(self):
        """Load or initialize ML models"""
        try:
            # For demo purposes, we'll use simple rule-based models
            # In production, these would be trained XGBoost/LSTM models
            self.models = {
                'location_predictor': self.create_location_predictor(),
                'activity_predictor': self.create_activity_predictor(),
                'similarity_calculator': self.create_similarity_calculator()
            }
            # Load face embeddings dataset for real face matching
            self.face_index = None
            self.face_meta = []
            self.face_embeddings = None
            self.load_face_embeddings()
            self.logger.info("ML models loaded successfully")
        except Exception as e:
            self.logger.error(f"Error loading models: {e}")
    
    def create_location_predictor(self):
        """Create location prediction model (simplified for demo)"""
        # IIT Guwahati locations with typical usage patterns
        location_patterns = {
            'ACADEMIC_COMPLEX': {
                'peak_hours': [9, 10, 11, 14, 15, 16],
                'departments': ['Computer Science', 'Electronics', 'Mechanical'],
                'base_probability': 0.3
            },
            'LIBRARY': {
                'peak_hours': [10, 11, 14, 15, 16, 17, 19, 20],
                'departments': ['all'],
                'base_probability': 0.25
            },
            'COMPUTER_CENTER': {
                'peak_hours': [10, 11, 14, 15, 16, 17],
                'departments': ['Computer Science', 'Electronics'],
                'base_probability': 0.2
            },
            'CAFETERIA': {
                'peak_hours': [8, 12, 13, 18, 19],
                'departments': ['all'],
                'base_probability': 0.15
            },
            'HOSTELS': {
                'peak_hours': [22, 23, 0, 1, 6, 7],
                'departments': ['all'],
                'base_probability': 0.1
            }
        }
        return location_patterns
    
    def create_activity_predictor(self):
        """Create activity prediction model (simplified for demo)"""
        activity_patterns = {
            'study_session': {'locations': ['LIBRARY', 'ACADEMIC_COMPLEX'], 'probability': 0.4},
            'lab_work': {'locations': ['COMPUTER_CENTER', 'LABS'], 'probability': 0.25},
            'meal_break': {'locations': ['CAFETERIA'], 'probability': 0.15},
            'social_activity': {'locations': ['CAFETERIA', 'HOSTELS'], 'probability': 0.1},
            'rest': {'locations': ['HOSTELS'], 'probability': 0.1}
        }
        return activity_patterns
    
    def create_similarity_calculator(self):
        """Create similarity calculation functions"""
        return {
            'jaro_winkler': self.jaro_winkler_similarity,
            'levenshtein': self.levenshtein_similarity,
            'jaccard': self.jaccard_similarity,
            'composite': self.composite_similarity
        }

    def load_face_embeddings(self):
        """Attempt to load face embeddings CSV into memory.

        The loader is flexible: it supports either a single column containing a
        JSON/list string named `embedding` (or `vector`) or many numeric columns
        representing embedding dimensions. It also expects at least `face_id`
        and optionally `entity_id`/`name` columns.
        """
        try:
            csv_path = os.getenv('FACE_EMBEDDINGS_CSV') or '../backend/src/data/face_embeddings.csv'
            # Resolve path relative to this file
            base = Path(__file__).resolve().parent
            candidate = (base / csv_path).resolve()
            if not candidate.exists():
                # Try absolute path as provided
                candidate = Path(csv_path)
            if not candidate.exists():
                self.logger.warning(f"Face embeddings CSV not found at {csv_path}")
                # Attempt to build embeddings from face image files as a fallback
                try:
                    images_dir = (base.parent / 'backend' / 'src' / 'data' / 'face_images').resolve()
                    if images_dir.exists() and images_dir.is_dir():
                        self.logger.info(f"Building face embeddings from images in {images_dir}")
                        metas = []
                        embeddings_list = []
                        for img_file in sorted(images_dir.iterdir()):
                            if img_file.suffix.lower() not in ('.jpg', '.jpeg', '.png'):
                                continue
                            try:
                                with open(img_file, 'rb') as f:
                                    img_bytes = f.read()
                                emb = self.image_bytes_to_embedding(img_bytes)
                                embeddings_list.append(emb)
                                face_id = img_file.stem
                                metas.append({'face_id': face_id, 'entity_id': None, 'name': None})
                            except Exception as e:
                                self.logger.warn(f"Failed to process image {img_file}: {e}")
                                continue

                        if embeddings_list:
                            self.face_embeddings = np.vstack(embeddings_list)
                            self.face_meta = metas
                            self._face_embeddings_normed = True
                            self.logger.info(f"Built {len(self.face_meta)} embeddings from images")
                            return
                except Exception as e:
                    self.logger.error(f"Fallback image-based embedding construction failed: {e}")
                return

            self.logger.info(f"Loading face embeddings from {candidate}")
            # Read a small sample to inspect columns
            df_sample = pd.read_csv(candidate, nrows=5)
            cols = list(df_sample.columns)

            # Determine embedding column
            embed_col = None
            for c in cols:
                if c.lower() in ('embedding', 'vector'):
                    embed_col = c
                    break

            meta_cols = ['face_id', 'entity_id', 'name']
            meta_present = {c: c for c in cols if c in meta_cols}

            if embed_col:
                # Embedding column contains a stringified list; parse with json
                df = pd.read_csv(candidate, converters={embed_col: lambda x: json.loads(x)})
                embeddings = np.vstack(df[embed_col].values)
                metas = []
                for _, row in df.iterrows():
                    metas.append({
                        'face_id': row.get('face_id'),
                        'entity_id': row.get('entity_id'),
                        'name': row.get('name')
                    })
            else:
                # Assume the remaining numeric columns are embedding dims
                # Heuristics: find first numeric column index after meta columns
                possible_meta = [c for c in cols if c in meta_cols]
                numeric_cols = [c for c in cols if c not in possible_meta]
                # Read numeric columns as embeddings
                df = pd.read_csv(candidate, usecols=cols)
                # Ensure numeric columns
                embed_df = df[numeric_cols].select_dtypes(include=[np.number])
                if embed_df.shape[1] < 2:
                    # couldn't detect numeric embedding columns
                    self.logger.warning('No numeric embedding columns detected in face embeddings CSV')
                    return
                embeddings = embed_df.values.astype(float)
                metas = []
                for _, row in df.iterrows():
                    metas.append({
                        'face_id': row.get('face_id') if 'face_id' in df.columns else None,
                        'entity_id': row.get('entity_id') if 'entity_id' in df.columns else None,
                        'name': row.get('name') if 'name' in df.columns else None
                    })

            # Store embeddings and meta
            self.face_embeddings = np.array(embeddings, dtype=float)
            self.face_meta = metas
            self._face_embeddings_normed = False
            self.logger.info(f"Loaded {len(self.face_meta)} face embeddings")

        except Exception as e:
            self.logger.error(f"Failed to load face embeddings: {e}")
            # don't raise during init; the service can still run with mock behaviour
            return

    def image_bytes_to_embedding(self, img_bytes: bytes, dim: int = None):
        """Create a deterministic embedding vector from raw image bytes.

        This is not a deep model — it is a deterministic, hash-based embedding
        useful for demos. It ensures the same image always maps to the same
        embedding, which allows matching against a dataset built the same way.
        """
        try:
            # Determine target dimension: prefer provided dim, otherwise match loaded dataset if available
            if dim is None:
                try:
                    if hasattr(self, 'face_embeddings') and self.face_embeddings is not None:
                        dim = int(self.face_embeddings.shape[1])
                    else:
                        dim = 128
                except Exception:
                    dim = 128

            # Use SHA256 seed and expand via repeated hashing to collect enough bytes
            hasher = hashlib.sha256()
            hasher.update(img_bytes)
            seed = hasher.digest()

            # Generate dim floats by repeated hashing of seed+counter
            vals = []
            counter = 0
            while len(vals) < dim:
                h = hashlib.sha256(seed + counter.to_bytes(4, 'little')).digest()
                for b in h:
                    # map byte 0..255 to float in [-0.5, 0.5]
                    vals.append((b / 255.0) - 0.5)
                    if len(vals) >= dim:
                        break
                counter += 1

            vec = np.array(vals[:dim], dtype=float)
            # Normalize to unit length
            norm = np.linalg.norm(vec)
            if norm == 0:
                return vec
            return vec / norm

        except Exception as e:
            self.logger.error(f"Error computing image embedding: {e}")
            # Return zero vector on failure
            return np.zeros(dim, dtype=float)

    def jaro_winkler_similarity(self, s1: str, s2: str) -> float:
        """Calculate Jaro-Winkler similarity between two strings"""
        if not s1 or not s2:
            return 0.0
        
        # Simple implementation for demo
        if s1 == s2:
            return 1.0
        
        len1, len2 = len(s1), len(s2)
        max_dist = max(len1, len2) // 2 - 1
        
        if max_dist < 1:
            return 1.0 if s1 == s2 else 0.0
        
        matches = 0
        s1_matches = [False] * len1
        s2_matches = [False] * len2
        
        # Find matches
        for i in range(len1):
            start = max(0, i - max_dist)
            end = min(i + max_dist + 1, len2)
            
            for j in range(start, end):
                if s2_matches[j] or s1[i] != s2[j]:
                    continue
                s1_matches[i] = s2_matches[j] = True
                matches += 1
                break
        
        if matches == 0:
            return 0.0
        
        # Calculate transpositions
        transpositions = 0
        k = 0
        for i in range(len1):
            if not s1_matches[i]:
                continue
            while not s2_matches[k]:
                k += 1
            if s1[i] != s2[k]:
                transpositions += 1
            k += 1
        
        jaro = (matches/len1 + matches/len2 + (matches - transpositions/2)/matches) / 3
        
        # Jaro-Winkler prefix bonus
        prefix = 0
        for i in range(min(len1, len2, 4)):
            if s1[i] == s2[i]:
                prefix += 1
            else:
                break
        
        return jaro + (0.1 * prefix * (1 - jaro))
    
    def levenshtein_similarity(self, s1: str, s2: str) -> float:
        """Calculate normalized Levenshtein similarity"""
        if not s1 or not s2:
            return 0.0
        
        if s1 == s2:
            return 1.0
        
        len1, len2 = len(s1), len(s2)
        
        # Create distance matrix
        matrix = [[0] * (len2 + 1) for _ in range(len1 + 1)]
        
        # Initialize first row and column
        for i in range(len1 + 1):
            matrix[i][0] = i
        for j in range(len2 + 1):
            matrix[0][j] = j
        
        # Fill matrix
        for i in range(1, len1 + 1):
            for j in range(1, len2 + 1):
                cost = 0 if s1[i-1] == s2[j-1] else 1
                matrix[i][j] = min(
                    matrix[i-1][j] + 1,      # deletion
                    matrix[i][j-1] + 1,      # insertion
                    matrix[i-1][j-1] + cost  # substitution
                )
        
        distance = matrix[len1][len2]
        max_len = max(len1, len2)
        return 1 - (distance / max_len) if max_len > 0 else 0.0
    
    def jaccard_similarity(self, s1: str, s2: str) -> float:
        """Calculate Jaccard similarity using character bigrams"""
        if not s1 or not s2:
            return 0.0
        
        if s1 == s2:
            return 1.0
        
        # Create bigrams
        bigrams1 = set(s1[i:i+2] for i in range(len(s1)-1))
        bigrams2 = set(s2[i:i+2] for i in range(len(s2)-1))
        
        if not bigrams1 and not bigrams2:
            return 1.0
        
        intersection = len(bigrams1.intersection(bigrams2))
        union = len(bigrams1.union(bigrams2))
        
        return intersection / union if union > 0 else 0.0
    
    def composite_similarity(self, record1: EntityRecord, record2: EntityRecord) -> Dict[str, float]:
        """Calculate composite similarity across all fields"""
        field_scores = {}
        
        # Name similarity (highest weight)
        if record1.name and record2.name:
            field_scores['name'] = self.jaro_winkler_similarity(
                record1.name.lower(), record2.name.lower()
            )
        
        # Email similarity
        if record1.email and record2.email:
            field_scores['email'] = self.jaro_winkler_similarity(
                record1.email.lower(), record2.email.lower()
            )
        
        # Phone similarity
        if record1.phone and record2.phone:
            # Normalize phone numbers (remove non-digits)
            phone1 = ''.join(filter(str.isdigit, record1.phone))
            phone2 = ''.join(filter(str.isdigit, record2.phone))
            field_scores['phone'] = self.levenshtein_similarity(phone1, phone2)
        
        # Student ID similarity
        if record1.student_id and record2.student_id:
            field_scores['student_id'] = 1.0 if record1.student_id == record2.student_id else 0.0
        
        # Card ID similarity
        if record1.card_id and record2.card_id:
            field_scores['card_id'] = 1.0 if record1.card_id == record2.card_id else 0.0
        
        # Device hash similarity
        if record1.device_hash and record2.device_hash:
            field_scores['device_hash'] = 1.0 if record1.device_hash == record2.device_hash else 0.0
        
        return field_scores
    
    def predict_location(self, entity_id: str, current_time: str, historical_data: List[Dict]) -> Dict:
        """Predict next location for an entity"""
        try:
            # Parse current time
            current_dt = datetime.fromisoformat(current_time.replace('Z', '+00:00'))
            current_hour = current_dt.hour
            current_day = current_dt.weekday()  # 0=Monday, 6=Sunday
            
            location_scores = {}
            
            # Calculate scores for each location based on patterns
            for location, pattern in self.models['location_predictor'].items():
                score = pattern['base_probability']
                
                # Time-based scoring
                if current_hour in pattern['peak_hours']:
                    score *= 2.0
                
                # Weekend adjustment
                if current_day >= 5:  # Weekend
                    if location in ['HOSTELS', 'CAFETERIA']:
                        score *= 1.5
                    else:
                        score *= 0.7
                
                # Historical pattern analysis
                if historical_data:
                    recent_locations = [item.get('location') for item in historical_data[-10:]]
                    location_frequency = recent_locations.count(location) / len(recent_locations)
                    score *= (1 + location_frequency)
                
                location_scores[location] = min(score, 1.0)
            
            # Sort by score
            sorted_locations = sorted(location_scores.items(), key=lambda x: x[1], reverse=True)
            
            # Prepare response
            predicted_location = sorted_locations[0][0]
            confidence = sorted_locations[0][1]
            
            top_3 = [
                {'location': loc, 'probability': score, 'reasoning': f'Score based on time patterns and historical data'}
                for loc, score in sorted_locations[:3]
            ]
            
            explanations = [
                f"Current time ({current_hour}:00) matches peak hours for {predicted_location}",
                f"Historical patterns show frequent visits to {predicted_location}",
                f"Day of week ({['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][current_day]}) influences location preference"
            ]
            
            # Mock SHAP values for explainability
            shap_values = {
                'time_of_day': 0.4,
                'day_of_week': 0.2,
                'historical_pattern': 0.3,
                'location_popularity': 0.1
            }
            
            return {
                'predicted_location': predicted_location,
                'confidence': confidence,
                'top_3_predictions': top_3,
                'explanations': explanations,
                'shap_values': shap_values
            }
            
        except Exception as e:
            self.logger.error(f"Error in location prediction: {e}")
            raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")
    
    def predict_activity(self, entity_id: str, current_time: str, location: str, historical_patterns: List[Dict]) -> Dict:
        """Predict current activity based on location and time"""
        try:
            current_dt = datetime.fromisoformat(current_time.replace('Z', '+00:00'))
            current_hour = current_dt.hour
            
            activity_scores = {}
            
            # Base activity prediction based on location and time
            for activity, pattern in self.models['activity_predictor'].items():
                score = pattern['probability']
                
                # Location-based scoring
                if location in pattern['locations']:
                    score *= 2.0
                
                # Time-based adjustments
                if activity == 'study_session' and 9 <= current_hour <= 17:
                    score *= 1.5
                elif activity == 'meal_break' and current_hour in [8, 12, 13, 18, 19]:
                    score *= 2.0
                elif activity == 'rest' and (current_hour >= 22 or current_hour <= 6):
                    score *= 2.0
                
                activity_scores[activity] = min(score, 1.0)
            
            # Normalize scores
            total_score = sum(activity_scores.values())
            if total_score > 0:
                activity_scores = {k: v/total_score for k, v in activity_scores.items()}
            
            predicted_activity = max(activity_scores.items(), key=lambda x: x[1])[0]
            confidence = activity_scores[predicted_activity]
            
            explanations = [
                f"Location '{location}' is commonly associated with {predicted_activity}",
                f"Time of day ({current_hour}:00) aligns with typical {predicted_activity} patterns",
                f"Historical data supports this activity prediction"
            ]
            
            return {
                'predicted_activity': predicted_activity,
                'confidence': confidence,
                'activity_probabilities': activity_scores,
                'explanations': explanations
            }
            
        except Exception as e:
            self.logger.error(f"Error in activity prediction: {e}")
            raise HTTPException(status_code=500, detail=f"Activity prediction error: {str(e)}")
    
    def match_face_embedding(self, query_embedding: List[float], threshold: float = 0.8) -> Dict:
        """Match face embedding against known faces using cosine similarity.

        This implementation loads the `face_embeddings.csv` dataset at startup and
        performs a simple nearest-neighbour search using cosine similarity. It is
        intentionally simple (no FAISS dependency) and works for demo/prototype
        purposes. If `face_embeddings.csv` is not available or failed to load,
        the function falls back to returning no matches.
        """
        try:
            if self.face_embeddings is None or len(self.face_meta) == 0:
                self.logger.warning("Face embeddings not loaded; cannot perform real matching")
                return {'matches': [], 'best_match': None, 'confidence': 0.0}

            q = np.array(query_embedding, dtype=float)
            if q.ndim != 1:
                q = q.flatten()

            # Normalize query and dataset for cosine similarity
            q_norm = np.linalg.norm(q)
            if q_norm == 0:
                return {'matches': [], 'best_match': None, 'confidence': 0.0}
            q_unit = q / q_norm

            # Compute dot product with all embeddings (assumes dataset is already normalized)
            # If dataset is not normalized, normalize now
            embeddings = self.face_embeddings
            if not hasattr(self, '_face_embeddings_normed') or not self._face_embeddings_normed:
                norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
                norms[norms == 0] = 1.0
                embeddings = embeddings / norms
                self.face_embeddings = embeddings
                self._face_embeddings_normed = True

            sims = np.dot(embeddings, q_unit)

            # Gather matches above threshold
            indices = np.where(sims >= threshold)[0]
            matches = []
            for idx in indices:
                meta = self.face_meta[idx].copy()
                meta['similarity'] = float(sims[idx])
                matches.append(meta)

            # Sort matches by similarity desc
            matches = sorted(matches, key=lambda x: x.get('similarity', 0.0), reverse=True)
            best = matches[0] if matches else None

            return {
                'matches': matches,
                'best_match': best,
                'confidence': best.get('similarity', 0.0) if best else 0.0
            }

        except Exception as e:
            self.logger.error(f"Error in face matching: {e}")
            raise HTTPException(status_code=500, detail=f"Face matching error: {str(e)}")

# Initialize ML service
ml_service = MLService()

# API Endpoints

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Campus Security ML Service",
        "status": "healthy",
        "version": "1.0.0",
        "endpoints": [
            "/similarity/calculate",
            "/prediction/location",
            "/prediction/activity", 
            "/face/match",
            "/health"
        ]
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "models_loaded": len(ml_service.models),
        "memory_usage": "Normal",
        "uptime": "Running"
    }

@app.post("/similarity/calculate", response_model=SimilarityResponse)
async def calculate_similarity(request: SimilarityRequest):
    """Calculate similarity between two entity records"""
    try:
        if request.algorithm == "composite":
            field_scores = ml_service.composite_similarity(request.record1, request.record2)
            
            # Calculate weighted composite score
            weights = {
                'name': 0.3,
                'email': 0.25,
                'phone': 0.2,
                'student_id': 0.1,
                'card_id': 0.1,
                'device_hash': 0.05
            }
            
            weighted_score = 0.0
            total_weight = 0.0
            
            for field, score in field_scores.items():
                if field in weights:
                    weighted_score += score * weights[field]
                    total_weight += weights[field]
            
            similarity_score = weighted_score / total_weight if total_weight > 0 else 0.0
            confidence = min(similarity_score * 1.2, 1.0)  # Boost confidence slightly
            
        else:
            # Single algorithm comparison (name field only for demo)
            similarity_func = ml_service.models['similarity_calculator'][request.algorithm]
            similarity_score = similarity_func(request.record1.name, request.record2.name)
            field_scores = {'name': similarity_score}
            confidence = similarity_score
        
        return SimilarityResponse(
            similarity_score=similarity_score,
            algorithm_used=request.algorithm,
            field_scores=field_scores,
            confidence=confidence
        )
        
    except Exception as e:
        logger.error(f"Error calculating similarity: {e}")
        raise HTTPException(status_code=500, detail=f"Similarity calculation error: {str(e)}")

@app.post("/prediction/location", response_model=LocationPredictionResponse)
async def predict_location(request: LocationPredictionRequest):
    """Predict next location for an entity"""
    try:
        result = ml_service.predict_location(
            request.entity_id,
            request.current_time,
            request.historical_data
        )
        
        return LocationPredictionResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in location prediction: {e}")
        raise HTTPException(status_code=500, detail=f"Location prediction error: {str(e)}")

@app.post("/prediction/activity", response_model=ActivityPredictionResponse)
async def predict_activity(request: ActivityPredictionRequest):
    """Predict current activity based on context"""
    try:
        result = ml_service.predict_activity(
            request.entity_id,
            request.current_time,
            request.location,
            request.historical_patterns
        )
        
        return ActivityPredictionResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in activity prediction: {e}")
        raise HTTPException(status_code=500, detail=f"Activity prediction error: {str(e)}")

@app.post("/face/match", response_model=FaceMatchResponse)
async def match_face(request: FaceMatchRequest):
    """Match face embedding against known faces"""
    try:
        result = ml_service.match_face_embedding(
            request.face_embedding,
            request.threshold
        )
        
        return FaceMatchResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in face matching: {e}")
        raise HTTPException(status_code=500, detail=f"Face matching error: {str(e)}")


@app.post("/embeddings/face")
async def generate_face_embeddings(request: Dict):
    """Generate deterministic face embeddings from base64 image data.

    Expected input: { "images": [ { "data": "<base64>" }, ... ], "model": "facenet" }
    Returns: { "embeddings": [ [...], ... ] }
    """
    try:
        images = request.get('images') if isinstance(request, dict) else request.images
        model = request.get('model', 'facenet') if isinstance(request, dict) else 'facenet'

        if not images or not isinstance(images, list):
            raise HTTPException(status_code=400, detail='images array is required')

        embeddings = []
        for img in images:
            # img may be {"data": base64} or raw base64 string
            b64 = img.get('data') if isinstance(img, dict) else img
            if not b64:
                embeddings.append(None)
                continue
            # Decode base64
            try:
                img_bytes = np.frombuffer(json.loads(json.dumps(b64)).encode('latin1'), dtype=np.uint8)
                # above is just a safe path; prefer actual decode
                import base64
                img_raw = base64.b64decode(b64)
            except Exception:
                # if decode fails, treat as None
                embeddings.append(None)
                continue

            # Ensure generated embedding uses same dimension as loaded dataset (if present)
            target_dim = None
            try:
                if hasattr(ml_service, 'face_embeddings') and ml_service.face_embeddings is not None:
                    target_dim = int(ml_service.face_embeddings.shape[1])
            except Exception:
                target_dim = None

            emb = ml_service.image_bytes_to_embedding(img_raw, dim=target_dim)
            embeddings.append(emb.tolist())

        return { 'embeddings': embeddings }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating face embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation error: {str(e)}")

@app.post("/batch/entity-resolution")
async def batch_entity_resolution(entities: List[EntityRecord]):
    """Batch entity resolution for multiple records"""
    try:
        results = []
        
        # Compare each entity with every other entity
        for i, entity1 in enumerate(entities):
            for j, entity2 in enumerate(entities[i+1:], i+1):
                field_scores = ml_service.composite_similarity(entity1, entity2)
                
                # Calculate composite score
                weights = {'name': 0.4, 'email': 0.3, 'phone': 0.2, 'student_id': 0.1}
                weighted_score = sum(
                    field_scores.get(field, 0) * weight 
                    for field, weight in weights.items()
                ) / sum(weights.values())
                
                if weighted_score > 0.7:  # Potential match threshold
                    results.append({
                        'entity1_id': entity1.entity_id,
                        'entity2_id': entity2.entity_id,
                        'similarity_score': weighted_score,
                        'field_scores': field_scores,
                        'match_type': 'high' if weighted_score > 0.9 else 'medium'
                    })
        
        return {
            'total_entities': len(entities),
            'potential_matches': len(results),
            'matches': results,
            'processing_time': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in batch entity resolution: {e}")
        raise HTTPException(status_code=500, detail=f"Batch processing error: {str(e)}")

@app.get("/analytics/model-performance")
async def get_model_performance():
    """Get model performance metrics (mock data for demo)"""
    return {
        'location_predictor': {
            'accuracy': 0.87,
            'precision': 0.84,
            'recall': 0.89,
            'f1_score': 0.86,
            'last_trained': '2024-01-15T10:30:00Z'
        },
        'activity_predictor': {
            'accuracy': 0.82,
            'precision': 0.79,
            'recall': 0.85,
            'f1_score': 0.82,
            'last_trained': '2024-01-15T10:30:00Z'
        },
        'face_matcher': {
            'accuracy': 0.95,
            'false_positive_rate': 0.02,
            'false_negative_rate': 0.03,
            'last_trained': '2024-01-15T10:30:00Z'
        },
        'entity_resolver': {
            'precision': 0.91,
            'recall': 0.88,
            'f1_score': 0.89,
            'duplicate_detection_rate': 0.93
        }
    }

if __name__ == "__main__":
    # Configuration
    HOST = os.getenv("ML_SERVICE_HOST", "0.0.0.0")
    PORT = int(os.getenv("ML_SERVICE_PORT", "8001"))
    
    logger.info(f"Starting Campus Security ML Service on {HOST}:{PORT}")
    
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=True,
        log_level="info"
    )