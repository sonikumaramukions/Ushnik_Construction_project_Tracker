from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model with a simple, explicit role field.
    This keeps role logic centralized and easy to reason about.
    """

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        PROJECT_MANAGER = "project_manager", "Project Manager"
        SUPERVISOR = "supervisor", "Supervisor"
        CONTRACTOR = "contractor", "Contractor"
        OWNER = "owner", "Owner"

    role = models.CharField(
        max_length=32,
        choices=Role.choices,
        default=Role.SUPERVISOR,
        help_text="Determines the high‑level permissions for the user.",
    )

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"


class Project(models.Model):
    """
    High‑level construction project (e.g., a building or site).
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    city = models.CharField(max_length=128, blank=True)
    location = models.CharField(max_length=255, blank=True)
    area_size = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Project area size (e.g., 1250.50).",
    )
    area_unit = models.CharField(
        max_length=16,
        blank=True,
        help_text="Unit for area size (e.g., sqft, sqm).",
    )
    client_name = models.CharField(max_length=255, blank=True)
    estimated_budget = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated budget for the project.",
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_projects",
    )
    project_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_projects",
        help_text="Primary project manager responsible for this project.",
    )
    owners = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="owned_projects",
        blank=True,
        help_text="Owners with read‑only access to this project.",
    )
    supervisors = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="assigned_projects",
        blank=True,
        help_text="Supervisors assigned to execute work on this project.",
    )
    progress_percent = models.PositiveIntegerField(
        default=0,
        help_text="Overall project progress (0‑100).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Phase(models.Model):
    """
    Logical phase within a project (e.g., Excavation, Foundation, Finishing).
    """

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="phases")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.project.name} / {self.name}"


class Task(models.Model):
    """
    Executable task within a phase, assigned to a supervisor.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        BLOCKED = "blocked", "Blocked"
        COMPLETED = "completed", "Completed"

    class ApprovalStatus(models.TextChoices):
        PENDING_ACCEPTANCE = "pending_acceptance", "Pending Acceptance"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        PENDING_COMPLETION = "pending_completion", "Pending Completion Approval"
        APPROVED = "approved", "Approved"

    phase = models.ForeignKey(Phase, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_tasks",
    )
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.PENDING,
    )
    approval_status = models.CharField(
        max_length=32,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING_ACCEPTANCE,
        help_text="Tracks the approval workflow state",
    )
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    progress_percent = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class TaskImage(models.Model):
    """
    Site images uploaded by supervisors for a task.
    Stored locally under MEDIA_ROOT for offline‑friendly deployments.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="task_images/")
    caption = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_task_images",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Image for {self.task.title}"


class Attendance(models.Model):
    """
    Daily labor attendance at a project for a given supervisor.
    Once created, rows are treated as immutable at the API layer.
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="attendances"
    )
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="attendance_records",
    )
    date = models.DateField()
    total_workers = models.PositiveIntegerField(default=0)
    present_workers = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "supervisor", "date")

    def __str__(self) -> str:
        return f"{self.project.name} - {self.date}"


class MaterialRequest(models.Model):
    """
    Material requests raised from site, later used for contractor bidding.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        PUBLISHED = "published", "Published to Contractors"

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="material_requests"
    )
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="raised_material_requests",
    )
    description = models.TextField(help_text="List of materials and quantities.")
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.PENDING,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_material_requests",
    )
    requested_date = models.DateField(auto_now_add=True)
    needed_by = models.DateField(null=True, blank=True)

    def __str__(self) -> str:
        return f"Material Request #{self.id} - {self.project.name}"


class RequirementSheet(models.Model):
    """
    Admin-published requirement sheet / RFQ document for contractors.
    Kept separate from MaterialRequest to support document-first procurement.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="requirement_sheets"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    document = models.FileField(upload_to="requirement_sheets/", blank=True, null=True)
    status = models.CharField(
        max_length=32, choices=Status.choices, default=Status.DRAFT
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_requirement_sheets",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.project.name} - {self.title}"


class Bid(models.Model):
    """
    Contractor bid for a published material request.
    """

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    material_request = models.ForeignKey(
        MaterialRequest, on_delete=models.CASCADE, related_name="bids"
    )
    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contractor_bids",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.SUBMITTED,
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Bid #{self.id} for MR #{self.material_request_id}"


class Notification(models.Model):
    """
    Simple in‑app notification stored in the DB.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    related_project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )

    def __str__(self) -> str:
        return f"Notification for {self.user.username}"


class DailyReport(models.Model):
    """
    Denormalized daily snapshot built from activity logs and core entities.
    This keeps reporting queries fast and straightforward.
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="daily_reports"
    )
    date = models.DateField()
    tasks_completed = models.PositiveIntegerField(default=0)
    attendance_summary = models.TextField(blank=True)
    images_count = models.PositiveIntegerField(default=0)
    material_requests_count = models.PositiveIntegerField(default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "date")

    def __str__(self) -> str:
        return f"Report {self.project.name} - {self.date}"


class ActivityLog(models.Model):
    """
    Low‑level audit trail similar to Azure DevOps history.
    The 'entity' fields are intentionally generic to keep this flexible.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="activity_logs",
    )
    action = models.CharField(max_length=255)
    entity_type = models.CharField(
        max_length=64, help_text="Model name or logical entity type."
    )
    entity_id = models.CharField(
        max_length=64, help_text="Primary key or natural key of the entity."
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(
        blank=True,
        null=True,
        help_text="Optional structured details about the change.",
    )

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self) -> str:
        return f"{self.timestamp} - {self.user} - {self.action}"


class SitePhoto(models.Model):
    """
    Site photos uploaded by supervisor. Visible to Project Manager and Owner.
    Records project name, picture name, and timestamp.
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="site_photos"
    )
    image = models.ImageField(upload_to="site_photos/%Y/%m/%d/")
    picture_name = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_site_photos",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self) -> str:
        return f"{self.picture_name or 'Photo'} - {self.project.name} @ {self.uploaded_at}"


class ConstructionWorker(models.Model):
    """
    Construction workers assigned to a project for attendance tracking.
    Added by Admin or Project Manager.
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="construction_workers"
    )
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=128, blank=True, help_text="e.g. Mason, Electrician")
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="added_construction_workers",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.role}) - {self.project.name}"


class AttendanceEntry(models.Model):
    """
    Per-worker attendance entry for a given attendance record.
    Supervisor marks which workers are present.
    """

    attendance = models.ForeignKey(
        Attendance, on_delete=models.CASCADE, related_name="entries"
    )
    worker = models.ForeignKey(
        ConstructionWorker, on_delete=models.CASCADE, related_name="attendance_entries"
    )
    present = models.BooleanField(default=True)

    class Meta:
        unique_together = ("attendance", "worker")

    def __str__(self) -> str:
        return f"{self.worker.name} - {'Present' if self.present else 'Absent'}"


class DailySheetTemplate(models.Model):
    """
    Template for daily project sheets created by Project Manager.
    Defines the structure (rows and columns) for daily reporting.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="daily_sheet_templates"
    )
    name = models.CharField(
        max_length=255,
        help_text="Template name (e.g., 'Daily Progress Report', 'Material Usage Sheet')"
    )
    description = models.TextField(blank=True)
    row_headings = models.JSONField(
        default=list,
        help_text="List of row heading labels, e.g., ['Task 1', 'Task 2', 'Labor Hours']"
    )
    column_headings = models.JSONField(
        default=list,
        help_text="List of column heading labels, e.g., ['Morning', 'Afternoon', 'Evening']"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_daily_sheet_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.project.name} - {self.name}"


class DailySheetEntry(models.Model):
    """
    Daily filled sheet entry by Site Manager/Supervisor.
    One entry per date per template.
    """
    template = models.ForeignKey(
        DailySheetTemplate, on_delete=models.CASCADE, related_name="entries"
    )
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="daily_sheet_entries"
    )
    date = models.DateField()
    filled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="filled_daily_sheets",
    )
    notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("template", "date")
        ordering = ["-date"]

    def __str__(self) -> str:
        return f"{self.template.name} - {self.date}"


class DailySheetCellData(models.Model):
    """
    Individual cell data for a daily sheet entry.
    Stores value at specific row/column intersection.
    """
    entry = models.ForeignKey(
        DailySheetEntry, on_delete=models.CASCADE, related_name="cell_data"
    )
    row_index = models.PositiveIntegerField(
        help_text="0-based row index"
    )
    column_index = models.PositiveIntegerField(
        help_text="0-based column index"
    )
    value = models.TextField(
        blank=True,
        help_text="Cell value entered by Site Manager"
    )

    class Meta:
        unique_together = ("entry", "row_index", "column_index")
        ordering = ["row_index", "column_index"]

    def __str__(self) -> str:
        return f"{self.entry} - Cell[{self.row_index},{self.column_index}]"

