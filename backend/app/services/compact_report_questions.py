"""Shared inline layout for day-specific report questions and exports."""
import html
import re


def question_parts(label, groups):
    parts = [(label + "  ", "label")]
    questions = [text for group in groups for text in group]
    for index, text in enumerate(questions):
        if index:
            parts.append((" / ", "separator"))
        parts.append((text, "question"))
    return parts


def questions_html(parts):
    styles = {
        "label": "font-weight:900;font-size:15px;margin-right:12px;",
        "separator": "font-weight:900;font-size:20px;line-height:1;vertical-align:-2px;padding:0 5px;",
        "question": "font-weight:400;",
    }
    return "".join(f'<span style="{styles[role]}">{html.escape(text)}</span>' for text, role in parts)


def layout_question_parts(parts, fonts, width):
    """Measure styled words before drawing, wrapping without clipping."""
    line_height = max(font.getbbox("Ag")[3] - font.getbbox("Ag")[1] for font in fonts.values()) + 10
    placements = []
    x = y = 0
    for text, role in parts:
        font = fonts[role]
        for token in re.findall(r"\S+|\s+", text):
            if token.isspace():
                x += font.getlength(" " * len(token))
                continue
            if x and x + font.getlength(token) > width:
                x = 0
                y += line_height
            # Long unbroken identifiers must also fit in the available width.
            chunk = ""
            for char in token:
                if chunk and font.getlength(chunk + char) > width:
                    placements.append((x, y, chunk, font))
                    x = 0
                    y += line_height
                    chunk = ""
                chunk += char
            placements.append((x, y, chunk, font))
            x += font.getlength(chunk)
    return placements, y + line_height
