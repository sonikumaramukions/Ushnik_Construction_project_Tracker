from django.contrib import admin
from .models import (
    SitePhoto,
    ConstructionWorker,
    AttendanceEntry,
    Attendance,
    DailySheetTemplate,
    DailySheetEntry,
    DailySheetCellData,
)

# Optional: register new models for admin UI
@admin.register(SitePhoto)
class SitePhotoAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "picture_name", "uploaded_by", "uploaded_at")
    list_filter = ("project", "uploaded_at")


@admin.register(ConstructionWorker)
class ConstructionWorkerAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "role", "project", "added_by", "created_at")
    list_filter = ("project", "role")


class AttendanceEntryInline(admin.TabularInline):
    model = AttendanceEntry
    extra = 0


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "supervisor", "date", "total_workers", "present_workers", "submitted_at")
    list_filter = ("project", "date")
    inlines = [AttendanceEntryInline]


@admin.register(DailySheetTemplate)
class DailySheetTemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "name", "created_by", "created_at")
    list_filter = ("project", "created_at")
    search_fields = ("name", "project__name")


class DailySheetCellDataInline(admin.TabularInline):
    model = DailySheetCellData
    extra = 0


@admin.register(DailySheetEntry)
class DailySheetEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "template", "project", "date", "filled_by", "submitted_at")
    list_filter = ("project", "date", "template")
    search_fields = ("template__name", "project__name")
    inlines = [DailySheetCellDataInline]

