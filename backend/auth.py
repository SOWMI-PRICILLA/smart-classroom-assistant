import bcrypt
import asyncio
import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from backend.db import users_collection

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

from backend.utils.db_utils import with_mongodb_retry

# HTTP Bearer token scheme
security = HTTPBearer()

# Pydantic models
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "student"  # "teacher" or "student"


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class User(BaseModel):
    email: str
    full_name: str
    role: str
    enrolled_sessions: list = []
    enrolled_subjects: list = []

# Password utilities (CPU intensive, offload to threads)
async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a password against its hash using bcrypt (non-blocking)."""
    try:
        return await asyncio.to_thread(
            bcrypt.checkpw,
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


async def get_password_hash(password: str) -> str:
    """Hashes a password using bcrypt (non-blocking)."""
    def hash_sync():
        return bcrypt.hashpw(
            password.encode("utf-8"), 
            bcrypt.gensalt()
        ).decode("utf-8")
    
    return await asyncio.to_thread(hash_sync)


# JWT utilities
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return TokenData(email=email)
    except JWTError:
        return None


# Authentication dependency
@with_mongodb_retry()
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    token_data = decode_token(token)
    
    if token_data is None or token_data.email is None:
        raise credentials_exception
    
    user = await users_collection.find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception
    
    return User(
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        enrolled_sessions=user.get("enrolled_sessions", []),
        enrolled_subjects=user.get("enrolled_subjects", [])
    )


# Role-based access control
def require_role(required_role: str):
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}"
            )
        return current_user
    return role_checker


# User authentication
@with_mongodb_retry()
async def authenticate_user(email: str, password: str) -> Optional[User]:
    user = await users_collection.find_one({"email": email})
    if not user:
        return None
    if not await verify_password(password, user["password_hash"]):
        return None
    return User(
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        enrolled_sessions=user.get("enrolled_sessions", []),
        enrolled_subjects=user.get("enrolled_subjects", [])
    )
