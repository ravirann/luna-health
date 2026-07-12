"""Shared language-mode constants for the voice pipeline."""

from __future__ import annotations

ENGLISH = "english"
HINGLISH = "hinglish"
HINDI = "hindi"

DEFAULT_LANGUAGE_MODE = HINGLISH
LANGUAGE_MODES = frozenset({ENGLISH, HINGLISH, HINDI})

CARTESIA_HINDI_HINT = "hi"

LANGUAGE_LABELS = {
    ENGLISH: "English",
    HINGLISH: "Hinglish",
    HINDI: "Hindi",
}


def normalize_language_mode(language_mode: str | None) -> str:
    mode = (language_mode or DEFAULT_LANGUAGE_MODE).strip().lower()
    if mode in LANGUAGE_MODES:
        return mode
    return DEFAULT_LANGUAGE_MODE


def language_mode_label(language_mode: str | None) -> str:
    mode = normalize_language_mode(language_mode)
    return LANGUAGE_LABELS[mode]
