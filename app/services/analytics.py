from collections import Counter, defaultdict
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ServiceObservation, SurveyRecord, TopicObservation


LEVEL_WEIGHTS = {
    "excelente": 5,
    "bueno": 4,
    "regular": 3,
    "malo": 1,
    "deficiente": 2,
    "critico": 1,
    "sin_dato": 0,
}


def build_dashboard_payload(db: Session, services_catalog: list[str]) -> dict[str, object]:
    records = list(
        db.scalars(
            select(SurveyRecord)
            .options(
                selectinload(SurveyRecord.services),
                selectinload(SurveyRecord.topics),
            )
            .order_by(SurveyRecord.created_at.desc())
        )
    )

    completed_records = [record for record in records if record.status == "completed"]
    topics = [topic for record in records for topic in record.topics]

    summary = {
        "total": len(records),
        "completed": len(completed_records),
        "processing": len([record for record in records if record.status in {"queued", "processing"}]),
        "failed": len([record for record in records if record.status == "failed"]),
        "suggestions": len([record for record in completed_records if record.primary_category in {"sugerencia", "mixto"}]),
        "complaints": len([record for record in completed_records if record.primary_category in {"queja", "mixto"}]),
        "negative_comments": len([record for record in completed_records if record.has_negative_comment]),
    }

    service_summary = []
    for service_name in services_catalog:
        observations = [
            service
            for record in completed_records
            for service in record.services
            if service.service_name == service_name and service.mentioned
        ]
        avg_score = round(mean([service.score for service in observations if service.score is not None]), 2) if any(
            service.score is not None for service in observations
        ) else None
        level_counter = Counter(service.quality_level for service in observations)
        service_summary.append(
            {
                "service_name": service_name,
                "documents": len(observations),
                "avg_score": avg_score,
                "dominant_level": level_counter.most_common(1)[0][0] if level_counter else "sin_dato",
                "weight": LEVEL_WEIGHTS.get(level_counter.most_common(1)[0][0], 0) if level_counter else 0,
            }
        )

    service_summary.sort(key=lambda item: (item["weight"], item["avg_score"] or 0, item["service_name"]))

    return {
        "summary": summary,
        "quality_levels": Counter(record.overall_quality_level for record in completed_records),
        "suggestions_by_department": _top_topics(topics, "suggestion"),
        "complaints_by_department": _top_topics(topics, "complaint"),
        "negative_comments_by_department": _top_topics(topics, "negative_comment"),
        "department_overview": _department_overview(completed_records),
        "service_summary": service_summary,
        "recent_records": records[:12],
    }


def _top_topics(topics: list[TopicObservation], kind: str, limit: int = 10) -> list[dict[str, object]]:
    grouped: dict[tuple[str, str], int] = defaultdict(int)
    display: dict[tuple[str, str], str] = {}
    for topic in topics:
        if topic.kind != kind:
            continue
        key = (topic.department or "Sin especificar", topic.normalized_topic)
        grouped[key] += 1
        display[key] = topic.topic_text

    sorted_items = sorted(grouped.items(), key=lambda item: item[1], reverse=True)
    return [
        {
            "department": department,
            "topic": display[(department, normalized)],
            "count": count,
        }
        for (department, normalized), count in sorted_items[:limit]
    ]


def _department_overview(records: list[SurveyRecord]) -> list[dict[str, object]]:
    grouped: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "suggestions": 0, "complaints": 0, "negative": 0}
    )
    for record in records:
        item = grouped[record.department or "Sin especificar"]
        item["total"] += 1
        if record.primary_category in {"sugerencia", "mixto"}:
            item["suggestions"] += 1
        if record.primary_category in {"queja", "mixto"}:
            item["complaints"] += 1
        if record.has_negative_comment:
            item["negative"] += 1

    return [
        {"department": department, **values}
        for department, values in sorted(grouped.items(), key=lambda item: item[1]["total"], reverse=True)
    ]
