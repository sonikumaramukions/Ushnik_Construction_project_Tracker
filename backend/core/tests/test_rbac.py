from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from core.models import Project, Phase, Task, Attendance, MaterialRequest, Bid

User = get_user_model()

class RBACTests(APITestCase):
    def setUp(self):
        # Create users for each role
        self.admin = User.objects.create_user(username="admin", password="password", role="admin")
        self.pm = User.objects.create_user(username="pm", password="password", role="project_manager")
        self.supervisor = User.objects.create_user(username="supervisor", password="password", role="supervisor")
        self.contractor = User.objects.create_user(username="contractor", password="password", role="contractor")
        self.owner = User.objects.create_user(username="owner", password="password", role="owner")

        # Create basic data
        self.project = Project.objects.create(name="Tower A", project_manager=self.pm, created_by=self.admin)
        self.phase = Phase.objects.create(project=self.project, name="Foundation")
        self.task = Task.objects.create(phase=self.phase, title="Dig", supervisor=self.supervisor)

    def test_admin_cannot_update_task(self):
        """Admin should read task but NOT update it."""
        self.client.force_authenticate(user=self.admin)
        url = reverse("task-detail", args=[self.task.id])
        
        # Read OK
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Update Forbidden
        response = self.client.patch(url, {"status": "completed"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_supervisor_update_task(self):
        """Supervisor updates task status."""
        self.client.force_authenticate(user=self.supervisor)
        url = reverse("task-detail", args=[self.task.id])
        
        response = self.client.patch(url, {"status": "in_progress"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_contractor_no_task_access(self):
        """Contractor cannot see internal tasks."""
        self.client.force_authenticate(user=self.contractor)
        url = reverse("task-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


        url_detail = reverse("task-detail", args=[self.task.id])
        response = self.client.get(url_detail)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_attendance_immutability(self):
        """Attendance created by supervisor, then immutable."""
        self.client.force_authenticate(user=self.supervisor)
        url_list = reverse("attendance-list")
        
        # Create
        data = {
            "project": self.project.id,
            "date": "2024-01-01",
            "total_workers": 10,
            "present_workers": 9
        }
        response = self.client.post(url_list, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attendance_id = response.data["id"]

        # Update attempt by Supervisor
        url_detail = reverse("attendance-detail", args=[attendance_id])
        response = self.client.patch(url_detail, {"notes": "Changed"})
        # Should be 403 or 400 based on our logic (we raised PermissionDenied which is 403)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Update attempt by Admin
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(url_detail, {"notes": "Admin Changed"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_material_request_contractor_visibility(self):
        """Contractor sees only PUBLISHED material requests."""
        # Create MRs
        mr_pending = MaterialRequest.objects.create(project=self.project, description="Cement", status="pending", raised_by=self.supervisor)
        mr_published = MaterialRequest.objects.create(project=self.project, description="Steel", status="published", raised_by=self.supervisor)

        self.client.force_authenticate(user=self.contractor)
        url = reverse("materialrequest-list")
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], mr_published.id)

    def test_user_management_admin_only(self):
        """Only Admin can manage users."""
        self.client.force_authenticate(user=self.pm)
        url = reverse("user-list")
        response = self.client.post(url, {"username": "newuser", "password": "pw", "role": "supervisor"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(url, {"username": "newuser", "password": "pw", "role": "supervisor"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
