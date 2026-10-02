"""Check the shared report SMTP credentials without sending an email.

Run from backend: python -m scripts.check_report_email
Run in the same environment as the API/scheduler/Celery process being checked.
"""
from __future__ import annotations

import smtplib
import ssl

from app.services.primeflow_report import GmailService


def main() -> int:
    try:
        gmail = GmailService()
    except ValueError as exc:
        print(f"Report email configuration failed: {exc}")
        return 1

    try:
        with smtplib.SMTP(gmail.host, gmail.port, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(gmail.sender, gmail.password)
    except smtplib.SMTPAuthenticationError as exc:
        print(
            f"Report email authentication failed (SMTP {exc.smtp_code}). "
            "Check EMAIL_USER and the Gmail App Password in EMAIL_PASSWORD "
            "for that same account. No email was sent."
        )
        return 1
    except (OSError, smtplib.SMTPException) as exc:
        print(
            f"Report email connection failed ({type(exc).__name__}). "
            "Check SMTP connectivity and TLS from this process environment. "
            "No email was sent."
        )
        return 1

    print(f"Report email authentication OK for {gmail.sender}. No email was sent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
