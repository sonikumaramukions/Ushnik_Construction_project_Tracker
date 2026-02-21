from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    """
    Allows access only to Admin users.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "admin"
        )


class IsProjectManager(BasePermission):
    """
    Allows access only to Project Managers.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "project_manager"
        )


class IsAdminOrProjectManager(BasePermission):
    """
    Allows access to Admin or Project Manager users.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ["admin", "project_manager"]
        )


class IsSupervisor(BasePermission):
    """
    Allows access only to Supervisors.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "supervisor"
        )


class IsContractor(BasePermission):
    """
    Allows access only to Contractors.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "contractor"
        )


class IsOwner(BasePermission):
    """
    Allows access only to Owners.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "owner"
        )


class TaskPermission(BasePermission):
    """
    Task Permissions:
    - Admin: Read-only (Cannot update tasks).
    - PM: Create, Assign (Update), Read.
    - Supervisor: Update status, upload images.
    - Owner: Read-only.
    - Contractor: No access.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        role = request.user.role
        
        # No access for Contractors, strict check
        if role == "contractor":
            return False

        # Read access
        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "supervisor", "owner"]

        # Write access
        # PMs can create tasks and assign them.
        if role == "project_manager":
            return True
        
        # Supervisors can update task status (partial_update/update).
        # We might want to restrict creation to PMs only in standard flow, 
        # but for now, assuming Supervisors update existing tasks.
        if role == "supervisor":
             # they usually only update status/images, but ViewSet allows write.
             return True

        # Admin cannot update tasks explicitly as per requirements.
        return False


class AttendancePermission(BasePermission):
    """
    Attendance Permissions:
    - Supervisor: Create (Record).
    - Admin/PM/Owner: Read-only.
    - Contractor: No access.
    - Updates are blocked at the View level or logic level (immutable).
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        role = request.user.role

        if role == "contractor":
            return False

        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "supervisor", "owner"]

        # Only Supervisor can record (create) attendance.
        if role == "supervisor" and request.method == "POST":
            return True

        return False


class MaterialRequestPermission(BasePermission):
    """
    MR Permissions:
    - Supervisor: Raise (Create).
    - PM: Approve/Reject (Update).
    - Admin: Publish (Update).
    - Contractor: Read (only published).
    - Owner: Read-only.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
            
        role = request.user.role

        if request.method in SAFE_METHODS:
            # Contractor needs read access, but filtered to published (handled in ViewSet)
            return True 

        # Create:
        # - Supervisor raises site requirements
        # - Admin can also create "auction/RFQ" style requests for contractors
        if request.method == "POST":
            return role in ["supervisor", "admin"]

        # Update (Approve - PM, Publish - Admin)
        if request.method in ["PUT", "PATCH"]:
            return role in ["project_manager", "admin"]
        
        return False


class BidPermission(BasePermission):
    """
    Bid Permissions:
    - Contractor: Submit (Create), Read own.
    - Admin/PM: Read all.
    - Owner: Read-only (implied).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        role = request.user.role

        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "contractor", "owner"]

        # Create: Contractor only
        if request.method == "POST":
            return role == "contractor"

        # Admin/PM select (Update status)? 
        # Req says Admin finalizes.
        if request.method in ["PUT", "PATCH"]:
            return role == "admin"
            
        return False


class RequirementSheetPermission(BasePermission):
    """
    Requirement Sheet Permissions:
    - Admin: Create/Update/Publish
    - Contractor: Read only published
    - PM/Owner: Read-only
    - Supervisor: No access (keeps procurement separate from site execution)
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        role = request.user.role

        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "contractor", "owner"]

        return role == "admin"


class SitePhotoPermission(BasePermission):
    """
    Site Photo Permissions:
    - Supervisor: Create (upload).
    - Project Manager, Owner, Admin: Read-only.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        role = request.user.role
        if role == "contractor":
            return False
        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "supervisor", "owner"]
        if request.method == "POST":
            return role == "supervisor"
        return False


class ConstructionWorkerPermission(BasePermission):
    """
    Construction Worker Permissions:
    - Admin, Project Manager: Create and Read.
    - Supervisor: Read-only (to take attendance).
    - Owner: Read-only.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        role = request.user.role
        if role == "contractor":
            return False
        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "supervisor", "owner"]
        if request.method == "POST":
            return role in ["admin", "project_manager"]
        return False


class DailySheetPermission(BasePermission):
    """
    Daily Sheet Permissions:
    - Project Manager: Create templates, view all entries for their projects
    - Supervisor: Fill entries, view own entries
    - Admin, Owner: View all (read-only)
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        role = request.user.role
        if role == "contractor":
            return False
        if request.method in SAFE_METHODS:
            return role in ["admin", "project_manager", "supervisor", "owner"]
        # Create permissions
        if request.method == "POST":
            # PM creates templates, Supervisor fills entries
            return role in ["project_manager", "supervisor"]
        # Update/Delete
        if request.method in ["PUT", "PATCH", "DELETE"]:
            return role in ["project_manager", "supervisor"]
        return False


