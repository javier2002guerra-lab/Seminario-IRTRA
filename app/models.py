from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SurveyRecord(Base):
    __tablename__ = "survey_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255), unique=True)
    storage_path: Mapped[str] = mapped_column(Text)
    optimized_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str] = mapped_column(String(120))
    extension: Mapped[str] = mapped_column(String(10))
    file_size: Mapped[int] = mapped_column(Integer)
    sha256_hash: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    intake_mode: Mapped[str] = mapped_column(String(20), default="upload")
    scanner_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey("survey_records.id"), nullable=True)
    department: Mapped[str] = mapped_column(String(160), default="Sin especificar")
    primary_category: Mapped[str] = mapped_column(String(20), default="neutral")
    sentiment: Mapped[str] = mapped_column(String(20), default="neutral")
    has_negative_comment: Mapped[bool] = mapped_column(Boolean, default=False)
    overall_quality_level: Mapped[str] = mapped_column(String(20), default="sin_dato")
    overall_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    conclusion_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    services: Mapped[list["ServiceObservation"]] = relationship(
        back_populates="record",
        cascade="all, delete-orphan",
    )
    topics: Mapped[list["TopicObservation"]] = relationship(
        back_populates="record",
        cascade="all, delete-orphan",
    )


class ServiceObservation(Base):
    __tablename__ = "service_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_id: Mapped[int] = mapped_column(ForeignKey("survey_records.id"), index=True)
    service_name: Mapped[str] = mapped_column(String(160), index=True)
    quality_level: Mapped[str] = mapped_column(String(20), default="sin_dato")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mentioned: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str] = mapped_column(Text, default="")

    record: Mapped[SurveyRecord] = relationship(back_populates="services")


class TopicObservation(Base):
    __tablename__ = "topic_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_id: Mapped[int] = mapped_column(ForeignKey("survey_records.id"), index=True)
    department: Mapped[str] = mapped_column(String(160), default="Sin especificar", index=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    topic_text: Mapped[str] = mapped_column(Text)
    normalized_topic: Mapped[str] = mapped_column(String(255), index=True)
    frequency_hint: Mapped[str] = mapped_column(String(20), default="media")

    record: Mapped[SurveyRecord] = relationship(back_populates="topics")
