async def cleanup_old_closed_ga_notes() -> int:
    """
    Retention policy: do not delete GA/KA notes.
    Returns the number of notes deleted (always 0).
    """
    return 0
