from pydantic import BaseModel, ConfigDict, Field


class TopicItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=280)
    frequency_hint: str = Field(pattern="^(alta|media|baja)$")


class NumberedAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_1: str | None = Field(default=None, max_length=300)
    item_2: str | None = Field(default=None, max_length=300)
    item_3: str | None = Field(default=None, max_length=300)
    item_4: str | None = Field(default=None, max_length=300)
    item_5: str | None = Field(default=None, max_length=500)
    item_6: str | None = Field(default=None, max_length=1200)
    item_7: str | None = Field(default=None, max_length=300)
    item_8: str | None = Field(default=None, max_length=300)
    item_9: str | None = Field(default=None, max_length=500)
    item_10: str | None = Field(default=None, max_length=300)
    item_11: str | None = Field(default=None, max_length=300)
    item_12: str | None = Field(default=None, max_length=300)
    item_13: str | None = Field(default=None, max_length=300)
    item_14: str | None = Field(default=None, max_length=500)


class QuestionnaireFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_number: str | None = Field(default=None, max_length=60)
    visitor_name: str | None = Field(default=None, max_length=160)
    affiliate_text: str | None = Field(default=None, max_length=160)
    affiliate_status: str = Field(pattern="^(si|no|sin_dato)$")
    visit_date: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    room_number: str | None = Field(default=None, max_length=80)
    visit_reason: str | None = Field(default=None, max_length=160)
    selected_contexts: list[str] = Field(default_factory=list, max_length=5)
    recommends_hostales: str = Field(pattern="^(si|no|sin_dato)$")
    had_difficulty: str = Field(pattern="^(si|no|sin_dato)$")
    difficulty_detail: str | None = Field(default=None, max_length=500)
    issue_resolved_in_time: str = Field(pattern="^(si|no|sin_dato)$")
    collaborator_caused_issue: str = Field(pattern="^(si|no|sin_dato)$")
    attendant_role: str | None = Field(default=None, max_length=120)
    attendant_name: str | None = Field(default=None, max_length=160)
    improvement_comment: str | None = Field(default=None, max_length=500)


class ServiceAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service_name: str = Field(min_length=1, max_length=160)
    mentioned: bool
    quality_level: str = Field(pattern="^(excelente|bueno|regular|malo|deficiente|critico|sin_dato)$")
    score: float | None = Field(default=None, ge=1, le=5)
    summary: str = Field(min_length=1, max_length=280)


class SurveyAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department: str = Field(min_length=1, max_length=160)
    survey_type: str = Field(pattern="^(sugerencia|queja|mixto|neutral)$")
    sentiment: str = Field(pattern="^(positivo|neutral|negativo)$")
    has_negative_comment: bool
    overall_quality_level: str = Field(pattern="^(alto|medio|bajo|critico|sin_dato)$")
    overall_quality_score: float | None = Field(default=None, ge=1, le=5)
    executive_summary: str = Field(min_length=1, max_length=1200)
    conclusions: list[str] = Field(min_length=1, max_length=5)
    questionnaire: QuestionnaireFields
    numbered_answers: NumberedAnswers
    suggestions: list[TopicItem] = Field(default_factory=list)
    complaints: list[TopicItem] = Field(default_factory=list)
    negative_comments: list[TopicItem] = Field(default_factory=list)
    services: list[ServiceAssessment] = Field(default_factory=list)
    extracted_text: str = Field(min_length=1)
