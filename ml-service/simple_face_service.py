#!/usr/bin/env python3
"""
Simplified Face Matching Service
FastAPI microservice focused only on face embedding generation and matching
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np
import pandas as pd
import logging
import uvicorn
import os
import json
import hashlib
import base64
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Simple Face Matching Service",
    description="Lightweight face embedding and matching service",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class FaceMatchRequest(BaseModel):
    face_embedding: List[float]
    threshold: float = 0.8

class FaceMatchResponse(BaseModel):
    matches: List[Dict[str, Any]]
    best_match: Optional[Dict[str, Any]]
    confidence: float

class FaceEmbeddingRequest(BaseModel):
    images: List[Dict[str, str]]  # [{"data": "base64_string"}, ...]

class FaceEmbeddingResponse(BaseModel):
    embeddings: List[List[float]]

class SimpleFaceService:
    """Simple face matching service"""
    
    def __init__(self):
        self.logger = logger
        self.face_embeddings = None
        self.face_meta = []
        self.embedding_dim = 512  # Default dimension to match typical datasets
        self.load_face_data()
    
    def load_face_data(self):
        """Load face embeddings from CSV or build from images"""
        try:
            # Try to load from CSV first
            csv_path = os.getenv('FACE_EMBEDDINGS_CSV', '../backend/src/data/face_embeddings.csv')
            base = Path(__file__).resolve().parent
            csv_file = (base / csv_path).resolve()
            
            if csv_file.exists():
                self.logger.info(f"Loading face embeddings from {csv_file}")
                df = pd.read_csv(csv_file)
                
                # Detect embedding columns (numeric columns that aren't metadata)
                meta_cols = ['face_id', 'entity_id', 'name']
                embedding_cols = [col for col in df.columns if col not in meta_cols and df[col].dtype in ['float64', 'int64']]
                
                if embedding_cols:
                    # Extract embeddings and metadata
                    embeddings = df[embedding_cols].values
                    self.face_embeddings = embeddings.astype(float)
                    self.embedding_dim = embeddings.shape[1]
                    
                    # Extract metadata
                    self.face_meta = []
                    for _, row in df.iterrows():
                        self.face_meta.append({
                            'face_id': row.get('face_id'),
                            'entity_id': row.get('entity_id'),
                            'name': row.get('name')
                        })
                    
                    self.logger.info(f"Loaded {len(self.face_meta)} face embeddings with dimension {self.embedding_dim}")
                    return
            
            # Fallback: build from face images
            self.logger.info("CSV not found, building embeddings from face images")
            self.build_embeddings_from_images()
            
        except Exception as e:
            self.logger.error(f"Failed to load face data: {e}")
            self.face_embeddings = None
            self.face_meta = []
    
    def build_embeddings_from_images(self):
        """Build embeddings from face images directory"""
        try:
            base = Path(__file__).resolve().parent
            images_dir = (base.parent / 'backend' / 'src' / 'data' / 'face_images').resolve()
            
            if not images_dir.exists():
                self.logger.warning(f"Face images directory not found: {images_dir}")
                return
            
            embeddings_list = []
            meta_list = []
            
            for img_file in sorted(images_dir.iterdir()):
                if img_file.suffix.lower() not in ('.jpg', '.jpeg', '.png'):
                    continue
                
                try:
                    with open(img_file, 'rb') as f:
                        img_bytes = f.read()
                    
                    # Generate deterministic embedding
                    embedding = self.generate_deterministic_embedding(img_bytes, self.embedding_dim)
                    embeddings_list.append(embedding)
                    
                    # Extract face_id from filename
                    face_id = img_file.stem
                    meta_list.append({
                        'face_id': face_id,
                        'entity_id': face_id.replace('F', 'E') if face_id.startswith('F') else None,
                        'name': None
                    })
                    
                except Exception as e:
                    self.logger.warning(f"Failed to process {img_file}: {e}")
                    continue
            
            if embeddings_list:
                self.face_embeddings = np.array(embeddings_list)
                self.face_meta = meta_list
                self.logger.info(f"Built {len(self.face_meta)} embeddings from images")
            
        except Exception as e:
            self.logger.error(f"Failed to build embeddings from images: {e}")
    
    def generate_deterministic_embedding(self, img_bytes: bytes, dim: int) -> np.ndarray:
        """Generate deterministic embedding from image bytes"""
        try:
            # Use SHA256 for deterministic hashing
            hasher = hashlib.sha256()
            hasher.update(img_bytes)
            seed = hasher.digest()
            
            # Generate embedding values
            vals = []
            counter = 0
            while len(vals) < dim:
                h = hashlib.sha256(seed + counter.to_bytes(4, 'little')).digest()
                for b in h:
                    if len(vals) >= dim:
                        break
                    # Map byte to float in [-1, 1]
                    vals.append((b / 127.5) - 1.0)
                counter += 1
            
            # Create and normalize vector
            vec = np.array(vals[:dim], dtype=float)
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            
            return vec
            
        except Exception as e:
            self.logger.error(f"Error generating embedding: {e}")
            return np.zeros(dim, dtype=float)
    
    def match_face_embedding(self, query_embedding: List[float], threshold: float = 0.8) -> Dict:
        """Match face embedding against loaded dataset"""
        try:
            if self.face_embeddings is None or len(self.face_meta) == 0:
                return {
                    'matches': [],
                    'best_match': None,
                    'confidence': 0.0
                }
            
            # Convert query to numpy array
            query = np.array(query_embedding, dtype=float)
            if query.ndim != 1:
                query = query.flatten()
            
            # Ensure dimensions match
            if query.shape[0] != self.face_embeddings.shape[1]:
                self.logger.warning(f"Dimension mismatch: query {query.shape[0]} vs dataset {self.face_embeddings.shape[1]}")
                return {
                    'matches': [],
                    'best_match': None,
                    'confidence': 0.0
                }
            
            # Normalize query
            query_norm = np.linalg.norm(query)
            if query_norm > 0:
                query = query / query_norm
            
            # Compute cosine similarities
            similarities = np.dot(self.face_embeddings, query)
            
            # Find matches above threshold
            valid_indices = np.where(similarities >= threshold)[0]
            
            matches = []
            for idx in valid_indices:
                match_data = self.face_meta[idx].copy()
                match_data['similarity'] = float(similarities[idx])
                match_data['confidence'] = float(similarities[idx])
                matches.append(match_data)
            
            # Sort by similarity
            matches.sort(key=lambda x: x['similarity'], reverse=True)
            
            best_match = matches[0] if matches else None
            confidence = best_match['confidence'] if best_match else 0.0
            
            self.logger.info(f"Found {len(matches)} matches, best confidence: {confidence:.3f}")
            
            return {
                'matches': matches,
                'best_match': best_match,
                'confidence': confidence
            }
            
        except Exception as e:
            self.logger.error(f"Error in face matching: {e}")
            return {
                'matches': [],
                'best_match': None,
                'confidence': 0.0
            }
    
    def generate_face_embeddings(self, images: List[Dict[str, str]]) -> List[List[float]]:
        """Generate embeddings for input images"""
        try:
            embeddings = []
            
            for img_data in images:
                try:
                    # Decode base64 image
                    b64_string = img_data.get('data', '')
                    if not b64_string:
                        embeddings.append(None)
                        continue
                    
                    img_bytes = base64.b64decode(b64_string)
                    
                    # Generate embedding with current dimension
                    embedding = self.generate_deterministic_embedding(img_bytes, self.embedding_dim)
                    embeddings.append(embedding.tolist())
                    
                except Exception as e:
                    self.logger.warning(f"Failed to process image: {e}")
                    embeddings.append(None)
            
            return embeddings
            
        except Exception as e:
            self.logger.error(f"Error generating face embeddings: {e}")
            return []

# Initialize service
face_service = SimpleFaceService()

# API Endpoints
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Simple Face Matching Service",
        "status": "healthy",
        "embeddings_loaded": face_service.face_embeddings is not None,
        "num_faces": len(face_service.face_meta),
        "embedding_dimension": face_service.embedding_dim
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "embeddings_loaded": face_service.face_embeddings is not None,
        "num_faces": len(face_service.face_meta),
        "embedding_dimension": face_service.embedding_dim,
        "dataset_shape": face_service.face_embeddings.shape if face_service.face_embeddings is not None else None
    }

@app.post("/face/match", response_model=FaceMatchResponse)
async def match_face(request: FaceMatchRequest):
    """Match face embedding against known faces"""
    try:
        result = face_service.match_face_embedding(
            request.face_embedding,
            request.threshold
        )
        
        return FaceMatchResponse(**result)
        
    except Exception as e:
        logger.error(f"Error in face matching endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Face matching error: {str(e)}")

@app.post("/embeddings/face", response_model=FaceEmbeddingResponse)
async def generate_face_embeddings(request: FaceEmbeddingRequest):
    """Generate face embeddings from base64 images"""
    try:
        embeddings = face_service.generate_face_embeddings(request.images)
        
        return FaceEmbeddingResponse(embeddings=embeddings)
        
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation error: {str(e)}")

@app.post("/cctv/recognize")
async def recognize_face_direct(request: Dict):
    """Direct face recognition from image data"""
    try:
        # Extract image data
        images = request.get('images', [])
        if not images:
            raise HTTPException(status_code=400, detail="No images provided")
        
        threshold = request.get('threshold', 0.7)
        
        # Generate embedding for first image
        embeddings = face_service.generate_face_embeddings(images[:1])
        if not embeddings or embeddings[0] is None:
            raise HTTPException(status_code=400, detail="Failed to generate embedding")
        
        # Match against dataset
        result = face_service.match_face_embedding(embeddings[0], threshold)
        
        return {
            "success": True,
            "match": result['best_match'],
            "confidence": result['confidence'],
            "matches": result['matches']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in direct recognition: {e}")
        raise HTTPException(status_code=500, detail=f"Recognition error: {str(e)}")

if __name__ == "__main__":
    HOST = os.getenv("ML_SERVICE_HOST", "0.0.0.0")
    PORT = int(os.getenv("ML_SERVICE_PORT", "8001"))
    
    logger.info(f"Starting Simple Face Matching Service on {HOST}:{PORT}")
    
    uvicorn.run(
        "simple_face_service:app",
        host=HOST,
        port=PORT,
        reload=True,
        log_level="info"
    )