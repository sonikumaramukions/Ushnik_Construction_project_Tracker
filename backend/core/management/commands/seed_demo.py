from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import Project


class Command(BaseCommand):
    help = "Create demo users and a sample project for local testing."

    def handle(self, *args, **options):
        User = get_user_model()

        demo_users = [
            # Admin also becomes a Django superuser so they can log into /admin
            ("admin_demo", "admin123!", User.Role.ADMIN, True),
            ("pm_demo", "pm123!", User.Role.PROJECT_MANAGER, False),
            ("supervisor_demo", "supervisor123!", User.Role.SUPERVISOR, False),
            ("contractor_demo", "contractor123!", User.Role.CONTRACTOR, False),
            ("owner_demo", "owner123!", User.Role.OWNER, False),
        ]

        created_users = []

        for username, password, role, is_super in demo_users:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"role": role, "email": f"{username}@example.com"},
            )
            if created:
                user.set_password(password)
                if is_super:
                    user.is_staff = True
                    user.is_superuser = True
                user.save()
                created_users.append((username, password, role, is_super))

        if created_users:
            self.stdout.write(self.style.SUCCESS("Created demo users:"))
            for username, password, role, is_super in created_users:
                extra = " + Django superuser" if is_super else ""
                self.stdout.write(f"  {username} / {password} (role: {role}){extra}")
        else:
            self.stdout.write(self.style.WARNING("Demo users already exist."))

        # Create a minimal sample project so dashboards have data hooks.
        admin_user = User.objects.filter(role=User.Role.ADMIN).first()
        pm_user = User.objects.filter(role=User.Role.PROJECT_MANAGER).first()

        if not Project.objects.exists() and admin_user and pm_user:
            Project.objects.create(
                name="Demo Tower A",
                description="Sample high‑rise construction project for demo.",
                city="Demo City",
                location="Central Business District",
                created_by=admin_user,
                project_manager=pm_user,
                progress_percent=35,
            )
            self.stdout.write(self.style.SUCCESS("Created sample project 'Demo Tower A'."))

