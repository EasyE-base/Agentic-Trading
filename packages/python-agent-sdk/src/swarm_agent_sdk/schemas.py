from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Optional, Literal


class Message(BaseModel):
    ts: str
    cid: Optional[str] = None
    source: Optional[str] = None
    version: str = Field(default="v1")


class SignalScore(BaseModel):
    symbol: str
    ts: str
    strategy: str
    score: float
    features: Optional[Dict[str, float]] = None
    version: str = Field(default="v1")


class SentimentIndex(BaseModel):
    symbol: str
    ts: str
    polarity: float
    confidence: float = Field(default=1.0)
    sources: Optional[List[str]] = None
    version: str = Field(default="v1")

    @field_validator("polarity")
    @classmethod
    def _validate_polarity(cls, v: float) -> float:
        if v < -1 or v > 1:
            raise ValueError("polarity must be between -1 and 1")
        return v

    @field_validator("confidence")
    @classmethod
    def _validate_confidence(cls, v: float) -> float:
        if v < 0 or v > 1:
            raise ValueError("confidence must be between 0 and 1")
        return v


class TrendState(BaseModel):
    symbol: str
    ts: str
    regime: Literal["UP", "DOWN", "SIDEWAYS"]
    macd: Optional[float] = None
    slope: Optional[float] = None
    strength: Optional[float] = None
    version: str = Field(default="v1")


class TradePlan(BaseModel):
    plan_id: str
    ts: str
    symbol: str
    action: Literal["BUY", "SELL"]
    qty: float
    price: float
    score: Optional[float] = None
    risk_status: Optional[str] = None
    version: str = Field(default="v1")


class ApprovedTrade(BaseModel):
    approval_id: str
    ts: str
    plan_id: str
    status: Literal["APPROVED", "ADJUSTED", "REJECTED"]
    notes: Optional[str] = None
    version: str = Field(default="v1")


