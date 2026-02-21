from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import (
    Project,
    Task,
    MaterialRequest,
    RequirementSheet,
    Bid,
    Notification,
    ActivityLog,
)

User = get_user_model()


def _create_activity_log(user, action: str, instance, metadata: dict | None = None):
    """
    Helper to centralize activity log creation logic.
    Keeps signals themselves very small and readable.
    """

    ActivityLog.objects.create(
        user=user if isinstance(user, User) else None,
        action=action,
        entity_type=instance.__class__.__name__,
        entity_id=str(getattr(instance, "pk", "")),
        metadata=metadata or {},
    )


@receiver(post_save, sender=Project)
def log_project_save(sender, instance: Project, created: bool, **kwargs):
    action = "Project created" if created else "Project updated"
    _create_activity_log(
        user=instance.created_by or instance.project_manager,
        action=action,
        instance=instance,
        metadata={"name": instance.name},
    )


@receiver(post_save, sender=Task)
def log_task_save(sender, instance: Task, created: bool, **kwargs):
    action = "Task created" if created else "Task updated"
    _create_activity_log(
        user=instance.supervisor or instance.phase.project.project_manager,
        action=action,
        instance=instance,
        metadata={
            "title": instance.title,
            "status": instance.status,
        },
    )


@receiver(post_save, sender=MaterialRequest)
def log_material_request(sender, instance: MaterialRequest, created: bool, **kwargs):
    action = "Material request created" if created else "Material request updated"
    _create_activity_log(
        user=instance.raised_by,
        action=action,
        instance=instance,
        metadata={
            "status": instance.status,
            "project": instance.project_id,
        },
    )


@receiver(post_save, sender=RequirementSheet)
def log_requirement_sheet(sender, instance: RequirementSheet, created: bool, **kwargs):
    action = "Requirement sheet created" if created else "Requirement sheet updated"
    _create_activity_log(
        user=instance.created_by,
        action=action,
        instance=instance,
        metadata={
            "status": instance.status,
            "project": instance.project_id,
            "title": instance.title,
        },
    )


@receiver(post_save, sender=Bid)
def log_bid(sender, instance: Bid, created: bool, **kwargs):
    action = "Bid submitted" if created else "Bid updated"
    _create_activity_log(
        user=instance.contractor,
        action=action,
        instance=instance,
        metadata={
            "status": instance.status,
            "amount": float(instance.amount),
        },
    )


@receiver(post_save, sender=Notification)
def log_notification(sender, instance: Notification, created: bool, **kwargs):
    if not created:
        return
    _create_activity_log(
        user=instance.user,
        action="Notification created",
        instance=instance,
        metadata={
            "message": instance.message[:100],
        },
    )

