# Data migration: ensure Django superusers have role='admin' so they can
# use Admin Console (delete users, create projects, etc.)

from django.db import migrations


def set_admin_role_for_superusers(apps, schema_editor):
    User = apps.get_model("core", "User")
    User.objects.filter(is_superuser=True).exclude(role="admin").update(role="admin")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_sitephoto_constructionworker_attendanceentry"),
    ]

    operations = [
        migrations.RunPython(set_admin_role_for_superusers, noop_reverse),
    ]
