"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import (
    RoleAwareTokenView,
    CurrentUserView,
    ContractorRegistrationView,
    UserViewSet,
    ProjectViewSet,
    PhaseViewSet,
    TaskViewSet,
    TaskImageViewSet,
    AttendanceViewSet,
    SitePhotoViewSet,
    ConstructionWorkerViewSet,
    MaterialRequestViewSet,
    RequirementSheetViewSet,
    BidViewSet,
    NotificationViewSet,
    DailyReportViewSet,
    ActivityLogViewSet,
    DashboardViewSet,
    DailySheetTemplateViewSet,
    DailySheetEntryViewSet,
)

router = routers.DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"phases", PhaseViewSet, basename="phase")
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"task-images", TaskImageViewSet, basename="taskimage")
router.register(r"attendance", AttendanceViewSet, basename="attendance")
router.register(r"site-photos", SitePhotoViewSet, basename="sitephoto")
router.register(r"construction-workers", ConstructionWorkerViewSet, basename="constructionworker")
router.register(r"material-requests", MaterialRequestViewSet, basename="materialrequest")
router.register(r"requirement-sheets", RequirementSheetViewSet, basename="requirementsheet")
router.register(r"bids", BidViewSet, basename="bid")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"daily-reports", DailyReportViewSet, basename="dailyreport")
router.register(r"activity-logs", ActivityLogViewSet, basename="activitylog")
router.register(r"dashboard", DashboardViewSet, basename="dashboard")
router.register(r"daily-sheet-templates", DailySheetTemplateViewSet, basename="dailysheettemplate")
router.register(r"daily-sheet-entries", DailySheetEntryViewSet, basename="dailysheetentry")

urlpatterns = [
    path("admin/", admin.site.urls),
    # JWT authentication endpoints
    path("api/auth/token/", RoleAwareTokenView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/auth/register/contractor/", ContractorRegistrationView.as_view(), name="contractor_register"),
    # Core API
    path("api/", include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
