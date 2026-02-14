# Schemas Package

from .resume_schema import (
    PROFILE_SCHEMA,
    CAREER_SCHEMA,
    SPEC_SCHEMA,
    SUMMARY_SCHEMA,
    RESUME_JSON_SCHEMA,
    RESUME_SCHEMA_PROMPT,
)

from .extractor_schemas import (
    EXTRACTOR_SCHEMAS,
    PROFILE_EXTRACTOR_SCHEMA,
    CAREER_EXTRACTOR_SCHEMA,
    EDUCATION_EXTRACTOR_SCHEMA,
    SKILLS_EXTRACTOR_SCHEMA,
    PROJECTS_EXTRACTOR_SCHEMA,
    SUMMARY_GENERATOR_SCHEMA,
    get_extractor_schema,
    get_extractor_prompt,
    get_max_text_length,
    get_preferred_model,
)

__all__ = [
    # Resume Schema (Legacy)
    "PROFILE_SCHEMA",
    "CAREER_SCHEMA",
    "SPEC_SCHEMA",
    "SUMMARY_SCHEMA",
    "RESUME_JSON_SCHEMA",
    "RESUME_SCHEMA_PROMPT",
    # Extractor Schemas (P1 정확도 향상)
    "EXTRACTOR_SCHEMAS",
    "PROFILE_EXTRACTOR_SCHEMA",
    "CAREER_EXTRACTOR_SCHEMA",
    "EDUCATION_EXTRACTOR_SCHEMA",
    "SKILLS_EXTRACTOR_SCHEMA",
    "PROJECTS_EXTRACTOR_SCHEMA",
    "SUMMARY_GENERATOR_SCHEMA",
    "get_extractor_schema",
    "get_extractor_prompt",
    "get_max_text_length",
    "get_preferred_model",
]
