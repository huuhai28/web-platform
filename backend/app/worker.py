import smtplib
import socket
from email.message import EmailMessage
from urllib.parse import urlparse

from celery import Celery

from .config import settings


celery_app = Celery("portfolio-worker", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_track_started=True,
    result_expires=3600,
    task_publish_retry=False,
    broker_connection_timeout=1,
    broker_transport_options={"max_retries": 0},
)


def broker_is_reachable(timeout: float = 0.25) -> bool:
    """Avoid blocking an API request when the optional local queue is offline."""
    parsed = urlparse(settings.redis_url)
    try:
        with socket.create_connection((parsed.hostname or "localhost", parsed.port or 6379), timeout):
            return True
    except OSError:
        return False


@celery_app.task(name="send_contact_notification", autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def send_contact_notification(name: str, email: str, subject: str, message: str) -> str:
    mail = EmailMessage()
    mail["From"] = settings.smtp_from
    mail["To"] = settings.contact_receiver_email
    mail["Reply-To"] = email
    mail["Subject"] = f"[Portfolio] {subject}"
    mail.set_content(f"From: {name} <{email}>\n\n{message}")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(mail)
    return "sent"

