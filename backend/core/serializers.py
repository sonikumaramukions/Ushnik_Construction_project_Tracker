from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    Project,
    Phase,
    Task,
    TaskImage,
    Attendance,
    AttendanceEntry,
    MaterialRequest,
    RequirementSheet,
    Bid,
    Notification,
    DailyReport,
    ActivityLog,
    SitePhoto,
    ConstructionWorker,
    DailySheetTemplate,
    DailySheetEntry,
    DailySheetCellData,
)


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Lightweight user representation exposed to the frontend."""

    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "password"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user


class PhaseCreateSerializer(serializers.Serializer):
    """Serializer for creating phases during project creation"""
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    order = serializers.IntegerField(default=0)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)


class ProjectSerializer(serializers.ModelSerializer):
    # Read side - with safe None handling
    project_manager = UserSerializer(read_only=True, allow_null=True)
    owners = UserSerializer(many=True, read_only=True)
    supervisors = UserSerializer(many=True, read_only=True)
    phases = serializers.SerializerMethodField()
    phases_count = serializers.IntegerField(source='phases.count', read_only=True)

    # Write side (IDs)
    project_manager_id = serializers.PrimaryKeyRelatedField(
        source="project_manager",
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    owner_ids = serializers.PrimaryKeyRelatedField(
        source="owners",
        queryset=User.objects.all(),
        many=True,
        required=False,
        write_only=True,
    )
    supervisor_ids = serializers.PrimaryKeyRelatedField(
        source="supervisors",
        queryset=User.objects.all(),
        many=True,
        required=False,
        write_only=True,
    )
    phases_data = PhaseCreateSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "description",
            "city",
            "location",
            "area_size",
            "area_unit",
            "client_name",
            "estimated_budget",
            "start_date",
            "end_date",
            "created_by",
            "project_manager",
            "owners",
            "supervisors",
            "progress_percent",
            "created_at",
            "updated_at",
            "phases",
            "phases_count",
            # write-only helpers
            "project_manager_id",
            "owner_ids",
            "supervisor_ids",
            "phases_data",
        ]

    def get_phases(self, obj):
        """Return phases ordered by order field"""
        try:
            phases = obj.phases.all().order_by('order')
            return PhaseSerializer(phases, many=True).data
        except Exception:
            return []

    def create(self, validated_data):
        """Create project with phases"""
        phases_data = validated_data.pop('phases_data', [])
        project = super().create(validated_data)
        
        # Create phases if provided
        for phase_data in phases_data:
            Phase.objects.create(project=project, **phase_data)
        
        return project

    def update(self, instance, validated_data):
        """Update project (phases updated separately via Phase API)"""
        validated_data.pop('phases_data', None)  # Ignore phases in update
        return super().update(instance, validated_data)


class PhaseSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    tasks_count = serializers.IntegerField(source='tasks.count', read_only=True)
    
    class Meta:
        model = Phase
        fields = "__all__"
        read_only_fields = ['project_name', 'tasks_count']


class TaskSerializer(serializers.ModelSerializer):
    supervisor = UserSerializer(read_only=True)

    class Meta:
        model = Task
        fields = "__all__"


class TaskImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskImage
        fields = "__all__"
        read_only_fields = ["uploaded_by", "uploaded_at"]


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = "__all__"
        read_only_fields = ["submitted_at"]


class MaterialRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialRequest
        fields = "__all__"


class RequirementSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequirementSheet
        fields = "__all__"
        read_only_fields = ["created_by", "created_at"]


class BidSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bid
        fields = "__all__"
        read_only_fields = ["submitted_at", "status"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"


class DailyReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyReport
        fields = "__all__"


class ActivityLogSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ActivityLog
        fields = "__all__"


class SitePhotoSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True, allow_null=True)

    class Meta:
        model = SitePhoto
        fields = [
            "id",
            "project",
            "project_name",
            "image",
            "picture_name",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
        ]
        read_only_fields = ["uploaded_by", "uploaded_at"]


class ConstructionWorkerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConstructionWorker
        fields = ["id", "project", "name", "role", "added_by", "created_at"]
        read_only_fields = ["added_by", "created_at"]


class AttendanceEntrySerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source="worker.name", read_only=True)
    worker_role = serializers.CharField(source="worker.role", read_only=True)

    class Meta:
        model = AttendanceEntry
        fields = ["id", "attendance", "worker", "worker_name", "worker_role", "present"]


class AttendanceWithEntriesSerializer(serializers.ModelSerializer):
    entries = AttendanceEntrySerializer(many=True, read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)

    class Meta:
        model = Attendance
        fields = [
            "id",
            "project",
            "project_name",
            "supervisor",
            "date",
            "total_workers",
            "present_workers",
            "notes",
            "submitted_at",
            "entries",
        ]
        read_only_fields = ["submitted_at"]


class AttendanceEntryCreateSerializer(serializers.Serializer):
    """Single entry: worker_id and present."""

    worker_id = serializers.IntegerField()
    present = serializers.BooleanField(default=True)


class AttendanceCreateWithEntriesSerializer(serializers.Serializer):
    """Payload for supervisor to submit attendance with per-worker entries."""

    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    entries = serializers.ListField(child=AttendanceEntryCreateSerializer())

    def create(self, validated_data):
        from .models import AttendanceEntry, ConstructionWorker

        project = validated_data["project"]
        date = validated_data["date"]
        notes = validated_data.get("notes", "")
        entries_data = validated_data["entries"]
        user = self.context["request"].user

        # Check unique (project, supervisor, date)
        if Attendance.objects.filter(project=project, supervisor=user, date=date).exists():
            raise serializers.ValidationError(
                {"date": "Attendance for this project and date already recorded."}
            )

        total = len(entries_data)
        present_count = sum(1 for e in entries_data if e.get("present", False))

        attendance = Attendance.objects.create(
            project=project,
            supervisor=user,
            date=date,
            total_workers=total,
            present_workers=present_count,
            notes=notes,
        )

        for e in entries_data:
            worker = ConstructionWorker.objects.get(id=e["worker_id"])
            if worker.project_id != project.id:
                raise serializers.ValidationError(
                    {"entries": f"Worker {worker.id} does not belong to this project."}
                )
            AttendanceEntry.objects.create(
                attendance=attendance,
                worker=worker,
                present=e.get("present", False),
            )

        return attendance


class DailySheetTemplateSerializer(serializers.ModelSerializer):
    """Serializer for daily sheet templates created by Project Manager."""
    project_name = serializers.CharField(source="project.name", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = DailySheetTemplate
        fields = [
            "id",
            "project",
            "project_name",
            "name",
            "description",
            "row_headings",
            "column_headings",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]


class DailySheetCellDataSerializer(serializers.ModelSerializer):
    """Serializer for individual cell data."""
    class Meta:
        model = DailySheetCellData
        fields = ["id", "entry", "row_index", "column_index", "value"]


class DailySheetEntrySerializer(serializers.ModelSerializer):
    """Serializer for daily sheet entries with nested cell data."""
    cell_data = DailySheetCellDataSerializer(many=True, read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    filled_by_username = serializers.CharField(source="filled_by.username", read_only=True)

    class Meta:
        model = DailySheetEntry
        fields = [
            "id",
            "template",
            "template_name",
            "project",
            "project_name",
            "date",
            "filled_by",
            "filled_by_username",
            "notes",
            "submitted_at",
            "updated_at",
            "cell_data",
        ]
        read_only_fields = ["filled_by", "submitted_at", "updated_at"]


class DailySheetEntryCreateSerializer(serializers.Serializer):
    """Serializer for creating/updating daily sheet entry with cell data."""
    template = serializers.PrimaryKeyRelatedField(queryset=DailySheetTemplate.objects.all())
    date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    cell_data = serializers.ListField(
        child=serializers.DictField(
            child=serializers.CharField(allow_blank=True)
        ),
        help_text="List of cell data: [{'row_index': 0, 'column_index': 0, 'value': 'text'}, ...]"
    )

    def validate(self, data):
        template = data["template"]
        cell_data_list = data.get("cell_data", [])
        
        # Validate that row/column indices are within template bounds
        num_rows = len(template.row_headings)
        num_cols = len(template.column_headings)
        
        for cell in cell_data_list:
            row_idx = int(cell.get("row_index", 0))
            col_idx = int(cell.get("column_index", 0))
            
            if row_idx < 0 or row_idx >= num_rows:
                raise serializers.ValidationError(
                    f"Invalid row_index {row_idx}. Template has {num_rows} rows."
                )
            if col_idx < 0 or col_idx >= num_cols:
                raise serializers.ValidationError(
                    f"Invalid column_index {col_idx}. Template has {num_cols} columns."
                )
        
        return data

    def create(self, validated_data):
        cell_data_list = validated_data.pop("cell_data", [])
        template = validated_data["template"]
        date = validated_data["date"]
        notes = validated_data.get("notes", "")
        user = self.context["request"].user

        # Get or create entry for this template and date
        entry, created = DailySheetEntry.objects.get_or_create(
            template=template,
            date=date,
            defaults={
                "project": template.project,
                "filled_by": user,
                "notes": notes,
            }
        )

        if not created:
            # Update existing entry
            entry.filled_by = user
            entry.notes = notes
            entry.save()
            # Clear old cell data
            entry.cell_data.all().delete()

        # Create cell data
        for cell in cell_data_list:
            DailySheetCellData.objects.create(
                entry=entry,
                row_index=int(cell.get("row_index", 0)),
                column_index=int(cell.get("column_index", 0)),
                value=str(cell.get("value", "")),
            )

        return entry


