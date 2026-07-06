def split_tags(tags: str | None) -> list[str]:
    return [tag.strip() for tag in (tags or "").split(",") if tag.strip()]
